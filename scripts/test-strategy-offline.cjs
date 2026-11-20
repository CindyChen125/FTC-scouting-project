const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const storage = new Map()
const taro = { getStorageSync: (key) => storage.get(key), setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
  removeStorageSync: (key) => storage.delete(key) }
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === '@tarojs/taro') return { __esModule: true, default: taro }
  return originalLoad.call(this, request, parent, ...args)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
const file = path.resolve(__dirname, '../src/strategy/offlineStrategy.ts')
let offline = require(file)
const record = (id) => ({ id, updatedAt: '2026-01-01T00:00:00Z' })
offline.cacheStrategy('one', record('s1'))
assert.equal(offline.cachedStrategy('one', 's1').id, 's1')
assert.equal(offline.cachedStrategy('two', 's1'), null, 'cache is scoped to signed-in user')
offline.saveWorkspace('one', { recordId: 's1', details: { name: 'Local' }, snapshot: { board: {}, timeline: {} }, savedAt: 'now' })
const pending = { base: { board: {}, timeline: {} }, versions: { 'robot:auto:red1': 2 },
  queue: [{ key: 'robot:auto:red1', value: { id: 'red1', x: 30 } }], conflicts: [] }
offline.savePendingRoom('one', 's1', pending)
offline.queuePendingSave('one', { recordId: 'local-1', baseRevision: 0, draft: { name: 'New' }, savedAt: 'now' })
offline.cacheStrategy('one', record('local-1'))
delete require.cache[file]
offline = require(file)
assert.equal(offline.readWorkspace('one').details.name, 'Local', 'draft survives module reload')
assert.equal(offline.readPendingRoom('one', 's1').versions['robot:auto:red1'], 2,
  'object revision survives module reload')
assert.equal(offline.readPendingRoom('one', 's1').queue[0].value.x, 30, 'pending edit survives module reload')
offline.cacheStrategies('one', [record('s2')])
assert(offline.cachedStrategy('one', 's1'), 'scenario with pending edits remains cached')
assert(offline.cachedStrategy('one', 'local-1'), 'offline-created scenario remains cached')
offline.clearPendingRoom('one', 's1')
offline.clearPendingSave('one', 'local-1')
offline.cacheStrategies('one', [record('s2')])
assert.equal(offline.cachedStrategy('one', 's1'), null, 'removed server scenario leaves cache after sync')
assert.equal(offline.cachedStrategy('one', 'local-1'), null)
console.log('Passed: per-user cache, durable workspace, durable revisions, pending saves, and cache pruning.')
