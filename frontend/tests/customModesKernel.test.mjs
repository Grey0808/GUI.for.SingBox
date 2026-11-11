import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

import {
  applyCustomModes,
  modeKey,
  modeDefinitionMatches,
  switchClashMode,
} from '../src/utils/customModes.ts'

test('actual kernel store switches modes without process, connection or network-settings operations', async () => {
  const mode = { id: 'work', name: 'Work', icon: '💼', outbound: 'proxy-id', rules: [] }
  const profile = {
    id: 'profile',
    inbounds: [],
    outbounds: [{ id: 'proxy-id', tag: 'proxy' }],
    customModes: [mode],
    route: {},
    dns: {},
    experimental: {},
  }
  const runtime = applyCustomModes(
    {
      outbounds: [{ type: 'socks', tag: 'proxy', server: '192.0.2.1', server_port: 1080 }],
      route: { final: 'proxy', rules: [] },
    },
    [mode],
    profile.outbounds,
  )
  let actual = 'Rule'
  let ignorePatch = false
  let offline = false
  let saves = 0
  const calls = []
  const forbidden = () => {
    throw Error('Forbidden process or network operation')
  }
  const modules = {
    pinia: { defineStore: (_id, setup) => setup },
    vue: {
      ref: (value) => ({ value }),
      computed: (fn) => ({
        get value() {
          return fn()
        },
      }),
      watch() {},
    },
    'vue-i18n': { useI18n: () => ({ t: (value) => value }) },
    '@/api/kernel': {
      getConfigs: async () => {
        if (offline) throw Error('offline')
        calls.push('get')
        return { mode: actual, 'mode-list': ['Rule', 'Global', 'Direct', modeKey(mode)] }
      },
      setConfigs: async ({ mode }) => {
        calls.push('patch')
        if (!ignorePatch) actual = mode
      },
    },
    '@/bridge': {
      ReadFile: async () => JSON.stringify(runtime),
      Exec: forbidden,
      ExecBackground: forbidden,
      KillProcess: forbidden,
      RemoveFile: forbidden,
    },
    '@/constant/kernel': { CoreConfigFilePath: 'fixture/config.json' },
    '@/constant/profile': {},
    '@/enums/app': {},
    '@/enums/kernel': { Inbound: {}, RulesetType: {}, TunStack: {} },
    '@/utils/coreReleases': {},
    '@/utils/coreSelection': {},
    '@/utils/customModes': { modeKey, modeDefinitionMatches, switchClashMode },
    '@/stores': {
      useEnvStore: () => ({}),
      useLogsStore: () => ({}),
      usePluginsStore: () => ({}),
      useProfilesStore: () => ({
        currentProfile: profile,
        saveProfiles: async () => {
          saves++
        },
      }),
      useSubscribesStore: () => ({}),
      useRulesetsStore: () => ({}),
      useAppSettingsStore: () => ({ app: { kernel: {} } }),
    },
    '@/utils': {
      deepClone: structuredClone,
      restoreProfile: () => structuredClone(profile),
      eventBus: { on() {} },
    },
  }
  const source = await readFile(new URL('../src/stores/kernelApi.ts', import.meta.url), 'utf8')
  const exports = {}
  new Function(
    'require',
    'exports',
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )((name) => {
    if (!modules[name]) throw Error(name)
    return modules[name]
  }, exports)
  const store = exports.useKernelApiStore()
  store.running.value = true
  await store.refreshConfig()
  assert.equal(store.modePending(mode), false)
  calls.length = 0
  await store.updateConfig('mode', modeKey(mode))
  assert.deepEqual(calls, ['get', 'patch', 'get', 'get'])
  assert.equal(profile.selectedMode, modeKey(mode))
  assert.equal(saves, 1)
  assert.equal(store.config.value.mode, modeKey(mode))
  mode.rules = [{ network: 'tcp' }]
  calls.length = 0
  await assert.rejects(store.updateConfig('mode', modeKey(mode)), /not applied/)
  assert.deepEqual(calls, [])
  mode.rules = []
  ignorePatch = true
  await assert.rejects(store.updateConfig('mode', 'Global'), /did not apply/)
  assert.equal(store.config.value.mode, modeKey(mode))
  assert.equal(saves, 1)
  profile.customModes = []
  await assert.rejects(store.updateConfig('mode', modeKey(mode)), /removed/)
  profile.customModes = [mode]
  offline = true
  await assert.rejects(store.updateConfig('mode', 'Direct'), /offline/)
  assert.equal(store.config.value.mode, '')
  assert.equal(store.running.value, true)
})
