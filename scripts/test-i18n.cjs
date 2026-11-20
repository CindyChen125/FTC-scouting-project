// Runs against real React components with in-memory storage and fake services.
// No requests, accounts, or database writes are made.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="test"></div></body></html>', { url: 'http://localhost' })
Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
const { createRoot } = require('react-dom/client')
const { act } = React
const h = React.createElement
const storage = new Map()
const user = { userId: 'test-user', username: 'Scout', displayName: 'Red', role: 'admin', isActive: true }
let route = {}
let entries = []
let pits = []
let exportedRows
let fetchScoutEntryCalls = 0
let fetchScoutEntryArgs
let fetchScoutEntryResult = null
let showModalCalls = 0
let reLaunchError
let submitOutcome = { status: 'synced' }
let submitScoutEntryCalls = 0
let submittedEntry
let submittedOperation
let lastNavigateUrl
let toastCalls = []
const taro = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  removeStorageSync: (key) => storage.delete(key),
  setNavigationBarTitle: async () => {},
  navigateTo: async ({ url }) => { lastNavigateUrl = url },
  showToast: async (options) => { toastCalls.push(options) },
  showModal: async () => { showModalCalls += 1; throw new Error('Taro.showModal should not be used') },
  reLaunch: async () => {
    if (reLaunchError) throw reLaunchError
  },
  useLoad: (fn) => React.useEffect(() => { fn(route) }, [])
}
const components = Object.fromEntries(['View', 'Text', 'Button', 'Input', 'Textarea', 'Image', 'Picker'].map((name) => [name,
  React.forwardRef(function MockComponent(props, ref) {
    const { children, className, onClick, value, placeholder, disabled, id, role } = props
    if (name === 'Picker') return h('div', { className }, h('select', {
      value: value ?? 0,
      onChange: (e) => props.onChange?.({ detail: { value: e.target.value } })
    }, props.range.map((label, index) => h('option', { key: index, value: index }, label))), children)
    if (name === 'Input' || name === 'Textarea') return h(name === 'Input' ? 'input' : 'textarea', {
      ref, className, value, placeholder, disabled, onChange: () => {},
      onInput: (e) => props.onInput?.({ detail: { value: e.target.value } })
    })
    return h(name === 'Button' ? 'button' : name === 'Text' ? 'span' : 'div', {
      ref, className, onClick, disabled, id, role,
      'aria-modal': props['aria-modal'],
      'aria-labelledby': props['aria-labelledby'],
      'aria-describedby': props['aria-describedby']
    }, children)
  })
]))
const mocks = {
  '@tarojs/taro': taro,
  '@tarojs/components': components,
  'AuthContext': { useAuth: () => ({ userId: user.userId, profile: user, isAdmin: user.role === 'admin', loading: false, signIn: async () => {} }) },
  'ThemeContext': { useTheme: () => ({ theme: 'light', fontScalePercent: 100 }), FONT_SCALE_MIN: 80, FONT_SCALE_MAX: 140, FONT_SCALE_STEP: 5 },
  'ActiveEventContext': { useActiveEvent: () => ({
    activeEvent: { id: 'event-active', code: 'BIOBUZZ-PRACTICE', name: 'BIOBUZZ Practice', season: 2026, isActive: true },
    events: [{ id: 'event-active', code: 'BIOBUZZ-PRACTICE', name: 'BIOBUZZ Practice', season: 2026, isActive: true }],
    loading: false,
    offline: false,
    refresh: async () => {}
  }) },
  'ftcScout': { readImportedEvents: () => [], syncImportedEvents: async () => [], STATIONS: ['Red 1', 'Red 2', 'Blue 1', 'Blue 2'] },
  'scouting': {
    fetchScoutEntry: async (...args) => { fetchScoutEntryCalls += 1; fetchScoutEntryArgs = args; return fetchScoutEntryResult },
    submitScoutEntry: async (entry, operation) => { submitScoutEntryCalls += 1; submittedEntry = entry; submittedOperation = operation; return submitOutcome },
    subscribeScoutEntries: (_, done) => { done(entries); return () => {} },
    subscribeScoutEntry: (_, __, ___, ____, done) => { done(entries[0]); return () => {} },
    flushOutbox: async () => 0,
    pendingCount: () => 0
  },
  'pit': { fetchPitEntry: async () => null, subscribePitEntries: (_, done) => { done(pits); return () => {} } },
  'admin': { fetchProfiles: async () => [user], fetchScoutCounts: async () => ({ [user.userId]: 2 }) },
  'photos': { robotPhotoUrl: async () => '' },
  'xlsx': { utils: {
    json_to_sheet: (rows) => { exportedRows = rows; return {} },
    book_new: () => ({}),
    book_append_sheet: (_, __, name) => assert(!/[\/?*\[\]:]/.test(name))
  }, writeFile: () => {} }
}
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (mocks[request]) return mocks[request]
  const name = path.basename(request)
  if (/AuthContext|ThemeContext|ActiveEventContext|ftcScout$|supabase\/(scouting|pit|admin|photos)$/.test(request) && mocks[name]) return mocks[name]
  return originalLoad.call(this, request, parent, ...args)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
require.extensions['.scss'] = () => {}
const { translate: t, setCurrentLanguage } = require('../src/i18n')
const { LanguageProvider, useLanguage } = require('../src/i18n/LanguageContext')
const SyncStatus = require('../src/components/SyncStatus').default
const { NOTE_OPTIONS, noteTagId, emptyAuto, emptyTeleop, emptyEndgame, scoutBackupKey, foulCategoryFor } = require('../src/types/scouting')
const { pitBackupKey } = require('../src/types/pit')
const { createOutbox, outboxKey } = require('../src/supabase/outbox')
const { classifySyncFailure, safeErrorMessage } = require('../src/supabase/timeout')
const { formatNotes } = require('../src/games/common')
const { exportEntriesToExcel, exportPitToExcel } = require('../src/utils/exportEntries')
const { biobuzzRows } = require('../src/utils/ranking')
const messages = require('../src/i18n/messages.json')
const mountPoint = document.getElementById('test')
let root
const flush = async (fn) => act(async () => { await fn(); await new Promise(setImmediate) })
const mount = async (Component) => {
  if (root) await flush(() => root.unmount())
  root = createRoot(mountPoint)
  await flush(() => root.render(h(LanguageProvider, null, h(Component))))
}
const rawNote = 'Red / 花粉 {team} $&'
const entry = {
  eventCode: 'BIOBUZZ-PRACTICE', matchId: 'Q12', teamNumber: '417', alliance: 'red',
  scoutName: 'Red', scoutedBy: user.userId, observationKey: user.userId,
  auto: { ...emptyAuto(), cellBalls: 4, noteTags: ['other', 'mechanical-failure'], noteText: rawNote },
  teleop: emptyTeleop(), endgame: emptyEndgame(), overallNotes: rawNote, updatedAt: 1700000000000
}
const pit = { eventCode: entry.eventCode, teamNumber: '417', scoutName: 'Red', scoutedBy: user.userId,
  data: { drivetrain: 'mecanum', hiveBalls: 'both', flowerBalls: 'pollen', colorSort: true, autoActions: ['leave'], role: 'hive', notes: rawNote }, updatedAt: entry.updatedAt }

async function main() {
  // Catch future hard-coded interface text and missing dictionary entries.
  for (const file of fs.readdirSync(path.join(__dirname, '../src'), { recursive: true }).filter((name) => /\.tsx?$/.test(name))) {
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const text = node.text.trim()
        assert(!/[a-zA-Z\p{Script=Han}]/u.test(text) || ['Q', 'BIOBUZZ 2026-2027'].includes(text), `Untranslated JSX in ${file}: ${text}`)
      }
      if (ts.isCallExpression(node) && ['t', 'tr'].includes(node.expression.getText(tree)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        assert(messages[node.arguments[0].text], `Unknown message in ${file}: ${node.arguments[0].text}`)
      }
      if (ts.isJsxAttribute(node) && node.name.text === 'className') {
        assert(!/\bt\(/.test(node.getText(tree)), `CSS identifiers must not be translated in ${file}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  for (const [key, message] of Object.entries(messages)) {
    assert(message.en && message.zh, `Missing translation: ${key}`)
    assert(!/\p{Script=Han}/u.test(message.en), `Chinese leaked into English message: ${key}`)
    const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    assert.deepEqual(placeholders(message.en), placeholders(message.zh), `Placeholder mismatch: ${key}`)
  }
  setCurrentLanguage('en')
  assert.equal(classifySyncFailure({ message: 'Observation identity cannot change' }).kind, 'schema', 'Old database trigger is classified as a migration issue')
  const before = JSON.stringify(entry)
  assert(formatNotes(entry.auto.noteTags, rawNote).includes(rawNote))
  assert.equal(t('teamNumber', { number: rawNote }).includes(rawNote), true)
  assert.deepEqual(NOTE_OPTIONS.map(noteTagId), ['disconnected', 'mechanical-failure', 'defense', 'early-nectar', 'over-control-limit', 'stuck-on-hive', 'other'])
  assert.equal(foulCategoryFor({ minorFouls: 0, majorFouls: 0 }), 'none')
  assert.equal(foulCategoryFor({ minorFouls: 1, majorFouls: 2 }), 'few')
  assert.equal(foulCategoryFor({ minorFouls: 2, majorFouls: 2 }), 'many')
  assert.equal(foulCategoryFor({ foulCategory: 'few', minorFouls: 99 }), 'few')
  assert.notEqual(
    outboxKey({ ...entry, observationKey: 'scout-a' }),
    outboxKey({ ...entry, observationKey: 'scout-b' }),
    'Independent scout observations must have different outbox identities'
  )
  assert.equal(classifySyncFailure({ code: '42703', message: 'column observation_key does not exist' }).kind, 'schema')
  assert.equal(classifySyncFailure({ code: '42501', message: 'row-level security' }).kind, 'permission')
  assert.equal(classifySyncFailure(new Error('Request timed out')).kind, 'network')
  assert.equal(
    safeErrorMessage(new Error('Authorization: Bearer eyJ12345678.abcdefgh.ijklmnop')),
    'Authorization: [redacted]',
    'Diagnostics redact credentials before display or logging'
  )
  assert.equal(
    safeErrorMessage({ errMsg: 'showModal:fail confirmText length should not larger then 4 Chinese characters' }),
    'showModal:fail confirmText length should not larger then 4 Chinese characters',
    'Taro callback errors retain their useful errMsg diagnostic'
  )
  const durableQueue = createOutbox('test-outbox', (item) => item.id)
  const queuedBeforeReadFailure = { original: { id: 'original', value: 1 } }
  storage.set('test-outbox', queuedBeforeReadFailure)
  const workingGetStorage = taro.getStorageSync
  taro.getStorageSync = () => { throw new Error('Storage unavailable') }
  assert.throws(() => durableQueue.enqueue({ id: 'new', value: 2 }), /Storage unavailable/)
  assert.deepEqual(storage.get('test-outbox'), queuedBeforeReadFailure, 'Unreadable queued data is never overwritten')
  taro.getStorageSync = workingGetStorage
  assert.notEqual(
    scoutBackupKey(user.userId, 'EVENT-A', 'Q1', '417'),
    scoutBackupKey(user.userId, 'EVENT-B', 'Q1', '417'),
    'Match drafts must remain event-scoped'
  )
  assert.notEqual(
    pitBackupKey(user.userId, 'EVENT-A', '417'),
    pitBackupKey(user.userId, 'EVENT-B', '417'),
    'Pit drafts must remain event-scoped'
  )
  exportEntriesToExcel([entry], 'Example')
  assert.equal(exportedRows[0][t('Scout')], 'Red')
  assert.equal(exportedRows[0][t('Overall Notes')], rawNote)
  exportPitToExcel([pit], 'Example')
  assert.equal(exportedRows[0][t('Notes')], rawNote)
  assert.equal(biobuzzRows([entry])[0].raw.reliability, 0)
  assert.equal(JSON.stringify(entry), before, 'Translation must not mutate stored data')
  entries = [entry, { ...entry, teamNumber: '418' }]
  pits = [pit]
  route = { eventCode: entry.eventCode, matchId: entry.matchId, teamNumber: entry.teamNumber, station: 'Red 1' }
  storage.set('scoutLanguage', 'English')
  await mount(require('../src/pages/index/index').default)
  assert(mountPoint.textContent.includes('Start Scouting'))
  assert.equal(storage.get('settings:language'), 'en', 'Legacy English preference is migrated')
  await flush(() => mountPoint.querySelector('.app-header-language-btn').click())
  assert(mountPoint.textContent.includes('开始侦查'))
  assert.equal(document.documentElement.lang, 'zh-CN')
  await flush(() => mountPoint.querySelector('.app-header-language-btn').click())
  assert.equal(document.documentElement.lang, 'en')
  function SyncStatusHarness() {
    const { toggleLanguage } = useLanguage()
    return h('div', null,
      h('button', { className: 'toggle-language', onClick: toggleLanguage }, 'toggle'),
      h(SyncStatus, { state: 'error', failure: { kind: 'schema', message: 'Observation identity cannot change' } })
    )
  }
  await mount(SyncStatusHarness)
  assert(mountPoint.textContent.includes('Database update required'), 'Sync error is English when English is selected')
  assert(!mountPoint.textContent.includes('Observation identity cannot change'), 'Raw server text is not shown to scouts')
  assert(!/\p{Script=Han}/u.test(mountPoint.querySelector('.sync-status').textContent), 'English sync status has no Chinese')
  await flush(() => mountPoint.querySelector('.toggle-language').click())
  assert(mountPoint.textContent.includes('数据库需要更新'), 'Sync error follows the Chinese selection')
  assert(!/[A-Za-z]/.test(mountPoint.querySelector('.sync-status').textContent), 'Chinese sync status has no English')
  await flush(() => mountPoint.querySelector('.toggle-language').click())
  for (const page of ['index', 'scout', 'pit', 'data', 'entry', 'settings', 'admin']) {
    await mount(require(`../src/pages/${page}/index`).default)
    let draft
    const draftKey = `backup:${user.userId}:${entry.eventCode}:${entry.matchId}:${entry.teamNumber}:${user.userId}`
    if (page === 'scout') {
      await flush(() => new Promise((resolve) => setTimeout(resolve, 500)))
      assert.equal(fetchScoutEntryCalls, 0, 'New observation mode does not load an existing submitted row')
      const counterLines = mountPoint.querySelectorAll('.counter-line')
      assert.equal(counterLines[0].children.length, 5, 'Balls into hive keeps −1, value, +1, +2, +4')
      assert.equal(counterLines[1].children.length, 3, 'Hive tips has only −1, value, +1')
      const fieldLabels = [...mountPoint.querySelectorAll('.field-label')].map((label) => label.textContent)
      assert(fieldLabels.includes('Auto park in loading zone'), 'Auto park remains on Start Scouting')
      assert(!fieldLabels.includes('Park in loading zone'), 'TeleOp park is removed from Start Scouting')
      assert(!fieldLabels.includes('Referee-called fouls (whole match)'), 'foul choice is removed from Start Scouting')
      await flush(() => mountPoint.querySelectorAll('.counter-btn')[1].click())
      await flush(() => mountPoint.querySelector('.chip').click())
      draft = JSON.stringify(storage.get(draftKey))
      assert.equal(storage.get(draftKey).auto.cellBalls, 1)
      assert.deepEqual(storage.get(draftKey).auto.noteTags, ['disconnected'])

      const teamInput = [...mountPoint.querySelectorAll('input')].find((input) => input.value === '417')
      const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
      const callsBeforeTyping = fetchScoutEntryCalls
      await flush(() => {
        for (const value of ['3', '32', '321', '3212', '32123']) {
          setValue.call(teamInput, value)
          teamInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
        }
      })
      await flush(() => new Promise((resolve) => setTimeout(resolve, 500)))
      assert.equal(fetchScoutEntryCalls - callsBeforeTyping, 0, 'Changing a new observation identity never loads an arbitrary remote row')
      await flush(() => {
        setValue.call(teamInput, '417')
        teamInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      await flush(() => new Promise((resolve) => setTimeout(resolve, 500)))
      draft = JSON.stringify(storage.get(draftKey))

      // The custom confirmation is bilingual and does not call Taro.showModal,
      // whose H5 implementation rejects these longer button labels.
      submitScoutEntryCalls = 0
      showModalCalls = 0
      const storageBeforeCancel = JSON.stringify([...storage.entries()])
      await flush(() => mountPoint.querySelector('.submit-btn').click())
      const dialog = mountPoint.querySelector('[role="dialog"]')
      assert(dialog, 'Submit opens the custom confirmation dialog')
      assert.equal(dialog.getAttribute('aria-modal'), 'true', 'Confirmation is exposed as a modal dialog')
      assert(dialog.textContent.includes('Submit scouting data for match Q12, team 417?'), 'Confirmation retains English copy')
      await flush(() => new Promise((resolve) => setTimeout(resolve, 10)))
      assert.equal(document.activeElement, mountPoint.querySelector('.confirm-dialog-cancel'), 'Cancel receives initial keyboard focus')
      await flush(() => mountPoint.querySelector('.confirm-dialog-cancel').click())
      assert.equal(mountPoint.querySelector('[role="dialog"]'), null, 'Cancel closes confirmation')
      assert.equal(submitScoutEntryCalls, 0, 'Cancel does not upload an entry')
      assert.equal(JSON.stringify([...storage.entries()]), storageBeforeCancel, 'Cancel does not save a submitted entry')
      assert.equal(showModalCalls, 0, 'Confirmation does not use the failing Taro.showModal API')

      // Escape is equivalent to Cancel in H5 and does not submit.
      await flush(() => mountPoint.querySelector('.submit-btn').click())
      await flush(() => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      assert.equal(mountPoint.querySelector('[role="dialog"]'), null, 'Escape closes confirmation')
      assert.equal(submitScoutEntryCalls, 0, 'Escape does not upload an entry')

      // Confirm proceeds exactly once even if the control receives two rapid
      // activation events, then preserves Synced across navigation failure.
      reLaunchError = new Error('History API unavailable')
      submitOutcome = { status: 'synced' }
      toastCalls = []
      const developmentErrors = []
      const workingConsoleError = console.error
      console.error = (...args) => developmentErrors.push(args)
      await flush(() => mountPoint.querySelector('.submit-btn').click())
      const confirmButton = mountPoint.querySelector('.confirm-dialog-confirm')
      await flush(() => { confirmButton.click(); confirmButton.click() })
      assert.equal(submitScoutEntryCalls, 1, 'Confirm starts the existing submission flow exactly once')
      assert(mountPoint.querySelector('.sync-status--synced'), 'Confirmed submission is immediately shown as synced')
      await flush(() => new Promise((resolve) => setTimeout(resolve, 1250)))
      console.error = workingConsoleError
      assert(mountPoint.querySelector('.sync-status--synced'), 'Navigation failure cannot downgrade confirmed sync')
      assert(toastCalls.some(({ title }) => title.includes('could not return home')), 'Navigation error is explained precisely')
      assert(!toastCalls.some(({ title }) => title.includes('Could not complete the action')), 'Generic hidden-error popup is not used')
      assert(developmentErrors.some(([scope]) => scope === '[match-scout:navigation]'), 'Development log identifies the failing phase')

      // A synchronous local-storage failure happens before Supabase. Keep the
      // form visible, expose the diagnostic, and do not pretend it was queued.
      const workingSetStorage = taro.setStorageSync
      const localSaveErrors = []
      console.error = (...args) => localSaveErrors.push(args)
      taro.setStorageSync = () => { throw new Error('Quota exceeded') }
      submitScoutEntryCalls = 0
      toastCalls = []
      await flush(() => mountPoint.querySelector('.submit-btn').click())
      await flush(() => mountPoint.querySelector('.confirm-dialog-confirm').click())
      taro.setStorageSync = workingSetStorage
      console.error = workingConsoleError
      assert.equal(submitScoutEntryCalls, 0, 'Supabase is not called when the submitted local snapshot cannot be saved')
      assert(mountPoint.querySelector('.sync-status--error').textContent.includes('Device storage failed'), 'Storage failure has a localized recovery message')
      assert(!mountPoint.querySelector('.sync-status--error').textContent.includes('Quota exceeded'), 'Raw storage diagnostic stays out of the interface')
      assert(toastCalls.some(({ title }) => title.includes('form remains open')), 'Storage failure explains that form data remains')
      assert(localSaveErrors.some(([scope]) => scope === '[match-scout:local-save]'), 'Development log identifies local storage failure')
      reLaunchError = undefined
    }
    assert(mountPoint.querySelector('.app-header-language-btn'), `Language switch is available on ${page}`)
    assert.equal(document.documentElement.lang, 'en')
    if (page === 'scout' || page === 'pit') {
      assert([...mountPoint.querySelectorAll('input')].some((input) => input.value === '417'), 'Bilingual rendering retains team number')
      assert(mountPoint.querySelector('.scout-identity').textContent.includes('Red'), 'Scout names remain unchanged')
    }
    if (draft) {
      const withoutTimestamp = (value) => {
        const parsed = JSON.parse(value)
        delete parsed.updatedAt
        return JSON.stringify(parsed)
      }
      assert.equal(withoutTimestamp(JSON.stringify(storage.get(draftKey))), withoutTimestamp(draft), 'UI rerenders must not change the saved scouting values')
    }
    if (page === 'data') {
      await flush(() => mountPoint.querySelectorAll('.tab-item')[1].click())
      assert(mountPoint.textContent.includes('reported breakdowns'))
      await flush(() => mountPoint.querySelectorAll('.tab-item')[2].click())
      assert(mountPoint.textContent.includes(rawNote), 'Pit notes remain untouched')
    }
    if (page === 'entry') {
      await flush(() => mountPoint.querySelector('.edit-btn').click())
      assert(lastNavigateUrl.includes('mode=edit'), 'Entry details opens the form in explicit edit mode')
      assert(lastNavigateUrl.includes('observationKey=test-user'), 'Entry details passes the selected observation identity')
    }
  }
  // Editing a selected row carries its complete identity through navigation,
  // loads that exact observation, and submits an update that preserves author.
  fetchScoutEntryResult = {
    ...entry,
    observationKey: 'test-user',
    scoutedBy: 'test-user',
    scoutName: 'Original Scout',
    auto: { ...emptyAuto(), cellBalls: 4 },
    teleop: emptyTeleop(),
    endgame: emptyEndgame()
  }
  route = {
    mode: 'edit', eventCode: entry.eventCode, matchId: entry.matchId,
    teamNumber: entry.teamNumber, observationKey: 'test-user'
  }
  const callsBeforeEdit = fetchScoutEntryCalls
  await mount(require('../src/pages/scout/index').default)
  await flush(() => new Promise((resolve) => setTimeout(resolve, 500)))
  assert.equal(fetchScoutEntryCalls - callsBeforeEdit, 1, 'Edit mode loads one selected observation')
  assert.equal(fetchScoutEntryArgs[4], 'test-user', 'Edit lookup uses the selected observation key')
  assert(mountPoint.querySelector('.scout-identity').textContent.startsWith('Original Scout'), 'Edit retains the original scout identity')
  const matchInput = [...mountPoint.querySelectorAll('input')].find((input) => input.value === '12')
  const teamInput = [...mountPoint.querySelectorAll('input')].find((input) => input.value === '417')
  assert(matchInput && teamInput && !matchInput.disabled && !teamInput.disabled, 'Match and team numbers can be corrected during editing')
  const setInputValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  await flush(() => {
    setInputValue.call(matchInput, '13')
    matchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    setInputValue.call(teamInput, '418')
    teamInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.equal(fetchScoutEntryCalls - callsBeforeEdit, 1, 'Changing match and team does not lose or refetch the edit target')
  submitScoutEntryCalls = 0
  await flush(() => mountPoint.querySelector('.submit-btn').click())
  await flush(() => mountPoint.querySelector('.confirm-dialog-confirm').click())
  assert.equal(submitScoutEntryCalls, 1)
  assert.equal(submittedOperation, 'update', 'Editing never uses the new-observation upsert path')
  assert.equal(submittedEntry.observationKey, 'test-user', 'Edit preserves the selected database identity')
  assert.equal(submittedEntry.matchId, 'Q13', 'Corrected match number is submitted')
  assert.equal(submittedEntry.teamNumber, '418', 'Corrected team number is submitted')
  assert.deepEqual(submittedEntry.editTarget, {
    eventCode: entry.eventCode, matchId: entry.matchId,
    teamNumber: entry.teamNumber, observationKey: 'test-user'
  }, 'The update still targets the original row')
  assert.equal(submittedEntry.scoutedBy, 'test-user', 'Edit preserves original authorship')
  assert.equal(submittedEntry.lastEditedBy, 'test-user', 'Edit records the current editor')
  assert.equal(storage.has(`scout:${user.userId}:${entry.eventCode}:Q12:417:${user.userId}`), false, 'The old local cache key is removed after a correction')
  assert(storage.has(`scout:${user.userId}:${entry.eventCode}:Q13:418:${user.userId}`), 'The corrected observation uses its new local cache key')

  // A pending correction appears under its new numbers in the list. Its Edit
  // link and a direct link must still target the original database row.
  const queuedCorrection = {
    ...entry, matchId: 'Q13', teamNumber: '418', pendingSyncOperation: 'update',
    editTarget: { eventCode: entry.eventCode, matchId: entry.matchId,
      teamNumber: entry.teamNumber, observationKey: 'test-user' }
  }
  entries = [queuedCorrection]
  route = { eventCode: entry.eventCode, matchId: 'Q13', teamNumber: '418', observationKey: 'test-user' }
  await mount(require('../src/pages/data/index').default)
  assert(mountPoint.querySelector('.entry-sync-pending').textContent.includes('Waiting to sync'), 'Pending correction is visibly marked in the data list')
  await mount(require('../src/pages/entry/index').default)
  await flush(() => mountPoint.querySelector('.edit-btn').click())
  assert(lastNavigateUrl.includes('matchId=Q12') && lastNavigateUrl.includes('teamNumber=417'), 'Pending correction Edit uses the original server identity')

  fetchScoutEntryResult = queuedCorrection
  route = { mode: 'edit', eventCode: entry.eventCode, matchId: 'Q13', teamNumber: '418', observationKey: 'test-user' }
  const callsBeforePendingEdit = fetchScoutEntryCalls
  await mount(require('../src/pages/scout/index').default)
  await flush(() => new Promise((resolve) => setTimeout(resolve, 500)))
  await flush(() => new Promise((resolve) => setTimeout(resolve, 500)))
  assert(fetchScoutEntryCalls - callsBeforePendingEdit >= 2, 'Direct pending-correction link recovers the original target')
  assert.equal(fetchScoutEntryArgs[2], 'Q12', 'Recovered edit reloads by the original match number')
  await flush(() => mountPoint.querySelector('.submit-btn').click())
  await flush(() => mountPoint.querySelector('.confirm-dialog-confirm').click())
  assert.deepEqual(submittedEntry.editTarget, queuedCorrection.editTarget, 'Resubmitting a pending correction updates its original row')
  entries = [entry, { ...entry, teamNumber: '418' }]

  fetchScoutEntryResult = null
  route = {
    mode: 'edit', eventCode: entry.eventCode, matchId: entry.matchId,
    teamNumber: entry.teamNumber, observationKey: 'missing-observation'
  }
  const submitCallsBeforeMissingEdit = submitScoutEntryCalls
  await mount(require('../src/pages/scout/index').default)
  await flush(() => new Promise((resolve) => setTimeout(resolve, 500)))
  assert(mountPoint.textContent.includes('This observation no longer exists.'), 'Missing edit target is explained')
  await flush(() => mountPoint.querySelector('.submit-btn').click())
  assert.equal(submitScoutEntryCalls, submitCallsBeforeMissingEdit, 'Missing edit target is never submitted as a new row')

  await mount(require('../src/auth/LoginScreen').default)
  await flush(() => mountPoint.querySelector('.login-btn').click())
  assert(mountPoint.textContent.includes('Enter your username and password'))
  await flush(() => mountPoint.querySelector('.login-language-btn').click())
  assert(mountPoint.textContent.includes('请输入用户名和密码'))
  await flush(() => mountPoint.querySelector('.login-language-btn').click())
  await mount(require('../src/pages/settings/index').default)
  assert.equal(document.documentElement.lang, 'en', 'Preference survives remount')
  await mount(require('../src/pages/admin/index').default)
  assert(mountPoint.textContent.includes('Event Management'), 'Admins can access Event Management')
  user.role = 'scout'
  await mount(require('../src/pages/admin/index').default)
  assert.equal(mountPoint.querySelector('.event-management'), null, 'Regular scouts cannot access Event Management controls')
  assert(mountPoint.textContent.includes('Admins only'))
  user.role = 'admin'
  const eventSql = fs.readFileSync(path.join(__dirname, '../supabase/event-management.sql'), 'utf8')
  assert(eventSql.includes('if not is_admin()'), 'Event RPCs enforce administrator access server-side')
  assert(eventSql.includes('competition_events_single_active'), 'Database enforces one active event')
  assert(eventSql.includes('supabase_realtime add table public.competition_events'), 'Active event changes publish through realtime')
  assert(!/delete from public\.scout_entries|delete from public\.pit_entries/i.test(eventSql), 'Event migration is non-destructive')
  const observationSql = fs.readFileSync(path.join(__dirname, '../supabase/scout-observation-key-migration.sql'), 'utf8')
  assert(observationSql.includes('add column if not exists observation_key'), 'Observation migration adds the missing column')
  assert(observationSql.includes("scouted_by::text, 'legacy'"), 'Observation migration backfills historical keys')
  assert(observationSql.includes('primary key (event_code, match_id, team_number, observation_key)'), 'Observation migration matches the client conflict target')
  assert(!/delete from|truncate/i.test(observationSql), 'Observation migration preserves historical rows')
  const ownerSql = fs.readFileSync(path.join(__dirname, '../supabase/owner-admin-migration.sql'), 'utf8')
  assert(ownerSql.includes('create table if not exists public.app_owner'), 'Owner migration stores one stable owner UUID')
  assert(ownerSql.includes('select public.is_owner()'), 'Existing admin checks become owner-only')
  assert(ownerSql.includes("'scout'"), 'New account profiles default to Scout')
  const adminFunction = fs.readFileSync(path.join(__dirname, '../supabase/functions/admin-users/index.ts'), 'utf8')
  assert(adminFunction.includes("owner?.user_id !== caller.id"), 'Account Edge Function checks the configured owner')
  assert(!adminFunction.includes("role === 'admin' ? 'admin'"), 'Account creation cannot promote a new Admin')
  const adminPage = fs.readFileSync(path.join(__dirname, '../src/pages/admin/index.tsx'), 'utf8')
  assert(!adminPage.includes('setProfileRole'), 'Admin UI has no role mutation control')
  assert(!adminPage.includes('Make admin'), 'Admin UI has no promotion action')
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8')
  assert(html.includes('./static/brand/favicon.svg'), 'Favicon uses a GitHub Pages-safe relative URL')
  for (const asset of ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png']) {
    assert(fs.existsSync(path.join(__dirname, '../src/static/brand', asset)), `Favicon asset exists: ${asset}`)
  }
  await flush(() => root.unmount())
  dom.window.close()
  console.log(`Passed: ${Object.keys(messages).length} bilingual message pairs, seven pages, language switching, exact-observation edit navigation, author preservation, missing-target protection, and existing scouting regressions.`)
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
