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
let showModalCalls = 0
let reLaunchError
let submitOutcome = { status: 'synced' }
let submitScoutEntryCalls = 0
let toastCalls = []
const taro = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  removeStorageSync: (key) => storage.delete(key),
  setNavigationBarTitle: async () => {},
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
      ref, className, value, placeholder, onChange: () => {},
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
    fetchScoutEntry: async () => { fetchScoutEntryCalls += 1; return null },
    submitScoutEntry: async () => { submitScoutEntryCalls += 1; return submitOutcome },
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
const { LanguageProvider } = require('../src/i18n/LanguageContext')
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
  setCurrentLanguage('both')
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
  assert(mountPoint.textContent.includes('开始侦查'))
  assert.equal(document.documentElement.lang, 'zh-CN')
  assert.equal(storage.get('settings:language'), 'both', 'Legacy preference is replaced by bilingual mode')
  assert.equal(mountPoint.querySelector('.language-picker'), null, 'Language switching is removed')
  for (const page of ['index', 'scout', 'pit', 'data', 'entry', 'settings', 'admin']) {
    await mount(require(`../src/pages/${page}/index`).default)
    let draft
    const draftKey = `backup:${user.userId}:${entry.eventCode}:${entry.matchId}:${entry.teamNumber}`
    if (page === 'scout') {
      await flush(() => new Promise((resolve) => setTimeout(resolve, 500)))
      assert.equal(fetchScoutEntryCalls, 1, 'Initial complete identity performs one remote lookup')
      const counterLines = mountPoint.querySelectorAll('.counter-line')
      assert.equal(counterLines[0].children.length, 5, 'Balls into hive keeps −1, value, +1, +2, +4')
      assert.equal(counterLines[1].children.length, 3, 'Hive tips has only −1, value, +1')
      assert.equal(mountPoint.querySelectorAll('.foul-choice').length, 3, 'Fouls uses exactly three choices')
      assert(mountPoint.querySelector('.foul-choice.active').textContent.includes('No Fouls'), 'No Fouls is selected by default')
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
      assert.equal(fetchScoutEntryCalls - callsBeforeTyping, 1, 'Rapid team typing is debounced to one remote lookup')
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
      assert(dialog.textContent.includes('提交场次 Q12、队伍 417 的侦查数据？'), 'Confirmation retains Chinese copy')
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
      assert(mountPoint.querySelector('.sync-status--error').textContent.includes('Quota exceeded'), 'Storage diagnostic is visible')
      assert(toastCalls.some(({ title }) => title.includes('form remains open')), 'Storage failure explains that form data remains')
      assert(localSaveErrors.some(([scope]) => scope === '[match-scout:local-save]'), 'Development log identifies local storage failure')
      reLaunchError = undefined
    }
    assert.equal(mountPoint.querySelector('.language-picker'), null, `No language picker on ${page}`)
    assert.equal(document.documentElement.lang, 'zh-CN')
    if (page === 'scout' || page === 'pit') {
      assert([...mountPoint.querySelectorAll('input')].some((input) => input.value === '417'), 'Bilingual rendering retains team number')
      assert(mountPoint.querySelector('.scout-identity').textContent.includes('Red'), 'Scout names remain unchanged')
    }
    if (draft) assert.equal(JSON.stringify(storage.get(draftKey)), draft, 'Bilingual rendering must not rewrite a draft')
    if (page === 'data') {
      await flush(() => mountPoint.querySelectorAll('.tab-item')[1].click())
      assert(mountPoint.textContent.includes('reported breakdowns'))
      assert(mountPoint.textContent.includes('场报告故障'))
      await flush(() => mountPoint.querySelectorAll('.tab-item')[2].click())
      assert(mountPoint.textContent.includes(rawNote), 'Pit notes remain untouched')
    }
  }
  await mount(require('../src/auth/LoginScreen').default)
  await flush(() => mountPoint.querySelector('.login-btn').click())
  assert(mountPoint.textContent.includes('Enter your username and password'))
  assert(mountPoint.textContent.includes('请输入用户名和密码'))
  assert.equal(mountPoint.querySelector('.language-picker'), null)
  await mount(require('../src/pages/settings/index').default)
  assert.equal(document.documentElement.lang, 'zh-CN', 'Preference survives remount')
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
  console.log(`Passed: ${Object.keys(messages).length} bilingual message pairs, 7 pages, login validation, rankings, exports, legacy preference migration, stable tags and preserved user content.`)
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
