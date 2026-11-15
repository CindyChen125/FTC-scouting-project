const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const storage = new Map()
const taro = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  removeStorageSync: (key) => storage.delete(key)
}
const calls = []
let updateRows = 1
let existingRow = null
let updateReject
const query = (kind, payload) => {
  const filters = {}
  const builder = {
    eq(key, value) { filters[key] = value; return this },
    order() { return this },
    limit() { return this },
    select() { return this },
    maybeSingle() {
      calls.push({ kind: 'lookup', filters: { ...filters } })
      return Promise.resolve({ data: existingRow, error: null })
    },
    then(resolve, reject) {
      if (kind === 'update') {
        calls.push({ kind, payload, filters: { ...filters } })
        if (updateReject) return Promise.reject(updateReject).then(resolve, reject)
        return Promise.resolve({ data: updateRows ? [{}] : [], error: null }).then(resolve, reject)
      }
      calls.push({ kind, payload })
      return Promise.resolve({ data: [], error: null }).then(resolve, reject)
    }
  }
  return builder
}
const supabase = {
  channel: () => ({ on() { return this }, subscribe() { return this } }),
  removeChannel: () => {},
  from: (table) => {
    assert.equal(table, 'scout_entries')
    return {
      upsert: (payload) => query('upsert', payload),
      update: (payload) => query('update', payload),
      select: () => query('select')
    }
  }
}
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === '@tarojs/taro') return taro
  if (request === './config' && parent?.filename.endsWith('/src/supabase/scouting.ts')) return { supabase }
  return originalLoad.call(this, request, parent, ...args)
}
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText, filename)
}

const { submitScoutEntry, flushOutbox, pendingCount, fetchScoutEntry, subscribeScoutEntries } = require('../src/supabase/scouting')
const { outboxKey, enqueue } = require('../src/supabase/outbox')
const { scoutBackupKey } = require('../src/types/scouting')
const entry = {
  observationKey: 'scout-a', eventCode: 'BIOBUZZ-PRACTICE', matchId: 'Q12', teamNumber: '417',
  alliance: 'red', scoutName: 'Original Scout', scoutedBy: 'scout-a', lastEditedBy: 'editor-b',
  auto: {}, teleop: {}, endgame: {}, overallNotes: 'edited', updatedAt: 1700000000000
}

async function main() {
  let outcome = await submitScoutEntry(entry, 'update')
  assert.equal(outcome.status, 'synced')
  assert.equal(calls.filter((call) => call.kind === 'update').length, 1)
  assert.equal(calls.filter((call) => call.kind === 'upsert').length, 0)
  assert.deepEqual(calls[0].filters, {
    event_code: 'BIOBUZZ-PRACTICE', match_id: 'Q12', team_number: '417', observation_key: 'scout-a'
  })
  assert.equal(calls[0].payload.scouted_by, 'scout-a', 'Updates preserve the original author')
  assert.equal(calls[0].payload.last_edited_by, 'editor-b', 'Updates record the editor')

  calls.length = 0
  const corrected = {
    ...entry, matchId: 'Q13', teamNumber: '418',
    editTarget: {
      eventCode: entry.eventCode, matchId: entry.matchId,
      teamNumber: entry.teamNumber, observationKey: entry.observationKey
    }
  }
  outcome = await submitScoutEntry(corrected, 'update')
  assert.equal(outcome.status, 'synced')
  assert.equal(calls[0].payload.match_id, 'Q13')
  assert.equal(calls[0].payload.team_number, '418')
  assert.deepEqual(calls[0].filters, {
    event_code: 'BIOBUZZ-PRACTICE', match_id: 'Q12', team_number: '417', observation_key: 'scout-a'
  }, 'Corrections update the original row')

  calls.length = 0
  updateRows = 0
  existingRow = null
  outcome = await submitScoutEntry(corrected, 'update')
  assert.equal(outcome.status, 'error')
  assert.equal(outcome.editTargetMissing, true)
  assert.equal(pendingCount(), 0, 'A missing edit target is not queued as a new insert')
  assert.equal(calls.some((call) => call.kind === 'upsert'), false)

  updateReject = { code: '23505', message: 'duplicate key value violates unique constraint' }
  outcome = await submitScoutEntry(corrected, 'update')
  assert.equal(outcome.editConflict, true, 'An occupied destination is reported as a correction conflict')
  assert.equal(pendingCount(), 0, 'A conflicting correction does not replace a different local observation')
  updateReject = undefined

  calls.length = 0
  updateRows = 1
  outcome = await submitScoutEntry({ ...entry, observationKey: 'scout-b', scoutedBy: 'scout-b' }, 'upsert')
  assert.equal(outcome.status, 'synced')
  assert.equal(calls[0].kind, 'upsert', 'New observations keep the idempotent insert path')
  assert.equal(calls[0].payload.observation_key, 'scout-b', 'Each scout gets an independent observation identity')

  calls.length = 0
  updateReject = new TypeError('Failed to fetch')
  outcome = await submitScoutEntry(corrected, 'update')
  assert.equal(outcome.status, 'queued', 'Offline edits remain queued')
  assert.equal(pendingCount(), 1)
  assert.equal(outboxKey({ ...corrected, pendingSyncOperation: 'update' }), outboxKey(entry), 'Queued correction stays keyed by its original identity')
  const reopened = await fetchScoutEntry('scout-a', corrected.eventCode, corrected.matchId, corrected.teamNumber, corrected.observationKey)
  assert.deepEqual(reopened.editTarget, corrected.editTarget, 'Opening a pending correction by its new numbers retains the original server target')
  const secondCorrection = {
    ...corrected, matchId: 'Q14', teamNumber: '419', updatedAt: corrected.updatedAt + 1,
    editTarget: { eventCode: corrected.eventCode, matchId: corrected.matchId,
      teamNumber: corrected.teamNumber, observationKey: corrected.observationKey },
    pendingSyncOperation: 'update'
  }
  storage.set(scoutBackupKey('scout-a', corrected.eventCode, 'Q13', '418', 'scout-a'), secondCorrection)
  const recoveredBackup = await fetchScoutEntry('scout-a', corrected.eventCode, 'Q12', '417', 'scout-a')
  assert.equal(recoveredBackup.teamNumber, '419', 'Reopening by the original identity restores the latest intermediate backup')
  assert.deepEqual(recoveredBackup.editTarget, corrected.editTarget, 'Intermediate backup resolves to the original server row')
  enqueue(secondCorrection)
  assert.equal(pendingCount(), 2, 'A queue created by the old edit flow may contain two linked moves')
  const reopenedAgain = await fetchScoutEntry('scout-a', corrected.eventCode, 'Q14', '419', corrected.observationKey)
  assert.deepEqual(reopenedAgain.editTarget, corrected.editTarget, 'Chained correction resolves to the original database row')
  const snapshots = []
  const unsubscribe = subscribeScoutEntries('scout-a', (entries) => snapshots.push(entries))
  assert.equal(snapshots[0].length, 1, 'Linked pending moves appear once in the data list')
  assert.equal(snapshots[0][0].matchId, 'Q14', 'The data list shows the latest corrected values')
  unsubscribe()
  updateReject = undefined
  calls.length = 0
  const flush = await flushOutbox()
  assert.equal(flush.pending, 0)
  assert.equal(calls.filter((call) => call.kind === 'update').length, 1, 'Linked moves retry as one update')
  assert.equal(calls.some((call) => call.kind === 'upsert'), false, 'Queued edits never become inserts')
  assert.deepEqual(calls.find((call) => call.kind === 'update').filters, {
    event_code: 'BIOBUZZ-PRACTICE', match_id: 'Q12', team_number: '417', observation_key: 'scout-a'
  }, 'Offline correction retains the original update target')
  assert.equal(calls.find((call) => call.kind === 'update').payload.match_id, 'Q14', 'Latest corrected values reach the server')

  console.log('Passed: exact-identity update, missing-target guard, independent scout keys, and offline update retry.')
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
