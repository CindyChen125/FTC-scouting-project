const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const rows = new Map()
const objects = new Map()
let serial = 0
const now = () => new Date(2026, 0, 1).toISOString()
const response = (data) => ({ data, error: null })

function query(operation) {
  const filters = []
  const chain = {
    select() { return chain },
    order() { return chain },
    eq(key, value) { filters.push([key, value]); return chain },
    in(key, values) { filters.push([key, values, 'in']); return chain },
    single() { return Promise.resolve(execute().data ? executeCache : response(null)) },
    maybeSingle() { return Promise.resolve(execute()) },
    then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject) }
  }
  let executed = false
  let executeCache
  function execute() {
    if (executed) return executeCache
    executed = true
    const matches = (row) => filters.every(([key, value, kind]) => kind === 'in' ? value.includes(row[key]) : row[key] === value)
    if (operation.table === 'strategy_objects') {
      executeCache = response([...objects.values()].filter(matches))
      return executeCache
    }
    if (operation.kind === 'insert') {
      const row = { id: `id-${++serial}`, ...operation.value, revision: 1,
        created_by: 'user-one', updated_by: 'user-one', created_at: now(), updated_at: now() }
      rows.set(row.id, row)
      executeCache = response(row)
    } else if (operation.kind === 'update') {
      const row = [...rows.values()].find(matches)
      if (row) { Object.assign(row, operation.value, { revision: row.revision + 1, updated_at: now() }); executeCache = response(row) }
      else executeCache = response(null)
    } else if (operation.kind === 'delete') {
      const row = [...rows.values()].find(matches)
      if (row) rows.delete(row.id)
      executeCache = response(row ? [{ id: row.id }] : [])
    } else {
      const found = [...rows.values()].filter(matches)
      executeCache = response(filters.length ? found[0] ?? null : found)
    }
    return executeCache
  }
  return chain
}

const supabase = { from: (table) => ({
  insert: (value) => query({ table, kind: 'insert', value }),
  update: (value) => query({ table, kind: 'update', value }),
  delete: () => query({ table, kind: 'delete' }),
  select: () => query({ table, kind: 'select' })
}), rpc: async (name, input) => {
  assert.equal(name, 'apply_strategy_object')
  const key = [input.p_kind, input.p_phase, ...(input.p_robot_id ? [input.p_robot_id] : []), input.p_object_id].join(':')
  const identity = `${input.p_strategy_id}/${key}`
  const previous = objects.get(identity)
  if ((previous?.revision ?? 0) !== input.p_expected_revision) return { data: null, error: { code: '40001' } }
  const saved = { strategy_id: input.p_strategy_id, object_key: key, kind: input.p_kind,
    phase: input.p_phase, robot_id: input.p_robot_id, object_id: input.p_object_id,
    value: input.p_value, revision: (previous?.revision ?? 0) + 1 }
  objects.set(identity, saved)
  return response(saved)
} }
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request.endsWith('/config') && parent?.filename.endsWith('/supabase/strategies.ts')) return { supabase }
  if (request.endsWith('/data/events')) return { CURRENT_EVENT_CODE: 'BIOBUZZ-PRACTICE' }
  return originalLoad.call(this, request, parent, ...args)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
const service = require(path.resolve(__dirname, '../src/supabase/strategies.ts'))
const { createStrategyBoard } = require(path.resolve(__dirname, '../src/strategy/annotations.ts'))
const { emptyTimeline } = require(path.resolve(__dirname, '../src/strategy/timeline.ts'))
const { strategyFingerprint } = require(path.resolve(__dirname, '../src/strategy/strategyRecord.ts'))

async function main() {
  const movement = emptyTimeline()
  movement.auto.red1.push({ id: 'waypoint-1', x: 50, y: 40, at: 6, heading: 90 })
  const draft = { name: 'Aggressive scoring', eventCode: 'BIOBUZZ-PRACTICE', matchNumber: 'Q12',
    redTeams: ['123', '456'], blueTeams: ['789', '101'], board: createStrategyBoard(), timeline: movement }
  const first = await service.createStrategy(draft)
  assert.equal((await service.getStrategy(first.id)).id, first.id)
  assert.equal(first.id, 'id-1')
  assert.equal(first.revision, 1)
  assert.equal(first.redTeams[0], '123')
  assert.equal(first.timeline.auto.red1[0].x, 50, 'timeline round trips through strategy persistence')
  assert.notEqual(strategyFingerprint(draft), strategyFingerprint({ ...draft, timeline: emptyTimeline() }),
    'route edits mark a scenario dirty')
  assert.equal(strategyFingerprint(draft), strategyFingerprint({ timeline: movement, board: draft.board,
    blueTeams: draft.blueTeams, redTeams: draft.redTeams, matchNumber: draft.matchNumber,
    eventCode: draft.eventCode, name: draft.name }), 'JSON object key order does not mark a save dirty')
  const edited = await service.updateStrategy(first, { ...draft, name: 'Balanced' })
  assert.equal(edited.id, first.id, 'Save updates the same record')
  assert.equal(edited.revision, 2)
  assert.equal((await service.listStrategies()).length, 1, 'Save does not duplicate')
  const moved = { ...edited.board.auto.robots[0], x: 25 }
  const patch = { key: 'robot:auto:red1', kind: 'robot', phase: 'auto', robotId: null,
    objectId: 'red1', value: moved }
  const savedObject = await service.applyStrategyObjectPatch(first.id, patch, 0)
  assert.equal(savedObject.revision, 1)
  assert.equal((await service.getStrategy(first.id)).board.auto.robots[0].x, 25,
    'object overlay is materialized on load')
  assert.equal((await service.listStrategies())[0].objectRevisions[patch.key], 1,
    'list exposes per-object revision')
  await assert.rejects(service.applyStrategyObjectPatch(first.id, patch, 0),
    (error) => error.code === '40001', 'stale object update is rejected')
  await assert.rejects(service.updateStrategy(first, draft), service.StrategyConflictError)
  const renamed = await service.renameStrategy(edited, 'Defensive')
  assert.equal(renamed.id, first.id)
  assert.equal(renamed.name, 'Defensive')
  const duplicate = await service.createStrategy({ ...draft, name: 'Aggressive scoring (copy)' }, renamed.id)
  assert.notEqual(duplicate.id, first.id)
  assert.equal(duplicate.sourceStrategyId, first.id)
  await service.deleteStrategy(duplicate.id)
  assert.equal((await service.listStrategies()).length, 1)
  console.log('Passed: scenario CRUD, object overlays, per-object revision guard, and duplicate.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
