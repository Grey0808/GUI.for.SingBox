import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'
import { lxCorePath } from '../src/utils/coreReleases.ts'
import { xhttpUnavailableReason } from '../src/utils/xhttpCompatibility.ts'

test('actual capability store rechecks binary and restores stored XHTTP nodes across selection changes', async () => {
  const settings = { app: { kernel: { branch: 'main', lxVersion: '1.14.4-lx.33' } } }
  const x = { tag: 'X', type: 'vless', transport: { type: 'xhttp', path: '/' } }
  const saved = JSON.stringify([x, { tag: 'S', type: 'socks' }])
  let report = 'sing-box version 1.14.4\nTags: with_clash_api'
  let broken = false
  const paths = []
  const modules = {
    pinia: { defineStore: (_id, setup) => setup },
    vue: { ref: (value) => ({ value }), watch() {} },
    '@/stores': {
      useAppSettingsStore: () => settings,
      useSubscribesStore: () => ({ subscribes: [{ id: 'sub', path: 'fixture/sub.json' }] }),
      useEnvStore: () => ({ env: { os: 'windows' } }),
    },
    '@/bridge': {
      FileSHA256: async (path) => {
        paths.push(path)
        if (broken) throw Error('missing binary')
        return 'a'.repeat(64)
      },
      Exec: async (_path, args) => {
        assert.deepEqual(args, ['version'])
        return report
      },
      ReadFile: async () => saved,
    },
    '@/utils/coreCapabilities': { parseCoreVersion },
    '@/utils/coreReleases': { lxCorePath },
    '@/utils/xhttpCompatibility': { xhttpUnavailableReason },
    '@/utils/eventBus': { eventBus: { on() {} } },
  }
  const source = await readFile(
    new URL('../src/stores/coreCapabilities.ts', import.meta.url),
    'utf8',
  )
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', code)((name) => {
    if (!modules[name]) throw Error(name)
    return modules[name]
  }, exports)
  const store = exports.useCoreCapabilitiesStore()
  await store.loadNodes()
  await store.refresh()
  assert.ok(store.reason('sub', 'X'))
  assert.equal(store.reason('sub', 'S'), '')
  settings.app.kernel.branch = 'lx'
  report = 'sing-box version 1.14.4-lx.33\nTags: with_xhttp'
  await store.refresh()
  assert.equal(store.reason('sub', 'X'), '')
  assert.ok(paths.includes('data/sing-box/versions/lx/1.14.4-lx.33/sing-box.exe'))
  report = 'sing-box version 1.99.0-lx.1\nTags: with_xhttp'
  await store.refresh()
  assert.ok(store.reason('sub', 'X'))
  broken = true
  await store.refresh()
  assert.ok(store.reason('sub', 'X'))
  broken = false
  report = 'sing-box version 1.14.4-lx.33\nTags: with_xhttp'
  await store.refresh()
  assert.equal(store.reason('sub', 'X'), '')
  assert.equal(store.reasonByTag('X'), '')
  assert.equal(store.reason('sub', 'S'), '')
})
