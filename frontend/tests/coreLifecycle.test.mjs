import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

import { selectedCorePath } from '../src/utils/coreReleases.ts'
import * as selection from '../src/utils/coreSelection.ts'

async function fixture(chosen) {
  const settings = { app: { kernel: { ...chosen, profile: 'fixture' } } }
  const profile = {
    id: 'fixture',
    inbounds: [],
    outbounds: [],
    dns: {},
    route: {},
    experimental: {},
  }
  const calls = []
  let failure = ''
  let processMatches = true
  let savedPid = false
  const forbidden = () => {
    throw Error('Unexpected network/system/process operation')
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
    'vue-i18n': { useI18n: () => ({ t: (v) => v }) },
    '@/api/kernel': {
      initWebsocket() {},
      getConfigs: async () => ({ mode: 'Rule' }),
      getProxies: async () => ({ proxies: {} }),
      probeApiAvailability: async () => true,
    },
    '@/bridge': {
      Exec: async (path, args, options) => {
        calls.push(['check', path, args, options])
        if (failure === 'check') throw Error('invalid configuration')
      },
      // Only a mock records a request. No OS process is spawned by these tests.
      ExecBackground: async (path, args, _out, _end, options) => {
        calls.push(['run', path, args, options])
        if (failure === 'run') throw Error('mock startup failure')
        return 777
      },
      ReadFile: async (path) =>
        path.endsWith('pid') ? (savedPid ? '777' : '-1') : JSON.stringify(profile),
      ProcessInfo: async () => 'renamed-core.exe',
      ProcessMatchesExecutable: async (pid, path) => {
        calls.push(['identity', pid, path])
        return processMatches
      },
      KillProcess: forbidden,
      RemoveFile: forbidden,
    },
    '@/constant/kernel': {
      CoreConfigFilePath: 'fixture/config.json',
      CorePidFilePath: 'fixture/pid',
      CoreLogFilePath: 'fixture/log',
    },
    '@/constant/profile': {},
    '@/enums/app': { Branch: { Alpha: 'alpha' } },
    '@/enums/kernel': { Inbound: {}, RulesetType: {}, TunStack: {} },
    '@/utils/coreReleases': { selectedCorePath },
    '@/utils/coreSelection': selection,
    '@/utils/customModes': {},
    '@/stores': {
      useEnvStore: () => ({
        env: { os: 'windows' },
        updateSystemProxyStatus: async () => {},
        setSystemProxy: forbidden,
        setSystemDNS: forbidden,
      }),
      useLogsStore: () => ({ clearKernelLog() {} }),
      usePluginsStore: () => ({ onCoreStartedTrigger: async () => {} }),
      useProfilesStore: () => ({ currentProfile: profile, getProfileById: () => profile }),
      useSubscribesStore: () => ({}),
      useRulesetsStore: () => ({}),
      useAppSettingsStore: () => settings,
    },
    '@/utils': {
      generateConfigFile: async () => {
        calls.push(['generate'])
      },
      getKernelRuntimeArgs: () => ['-D', 'fixture', 'run', '-c', 'fixture/config.json'],
      getKernelRuntimeEnv: () => ({ APP_DATA_PATH: 'fixture' }),
      deepClone: structuredClone,
      restoreProfile: (v) => v,
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
    assert.ok(modules[name], name)
    return modules[name]
  }, exports)
  return {
    store: exports.useKernelApiStore(),
    settings,
    calls,
    fail: (v) => {
      failure = v
    },
    pid: (matches) => {
      savedPid = true
      processMatches = matches
    },
  }
}

test('every selection uses exactly the same executable, configuration and environment for check then run', async () => {
  for (const chosen of [
    { branch: 'main' },
    { branch: 'alpha' },
    { branch: 'lx', lxVersion: '1.14.4-lx.33' },
    { branch: 'official', officialVersion: '1.14.4' },
    { branch: 'custom', customPath: 'D:\\fixtures\\renamed.exe' },
  ]) {
    const f = await fixture(chosen)
    f.settings.app.kernel.previousKernelSelection = { branch: 'main' }
    await f.store.startCore()
    assert.deepEqual(
      f.calls.map((c) => c[0]),
      ['generate', 'check', 'run'],
    )
    const [, check, run] = f.calls
    assert.equal(check[1], selectedCorePath(chosen, 'windows'))
    assert.equal(check[1], run[1])
    assert.deepEqual(check[2], ['-D', 'fixture', 'check', '-c', 'fixture/config.json'])
    assert.deepEqual(check[3].Env, run[3].Env)
    assert.equal(f.settings.app.kernel.previousKernelSelection, undefined)
    assert.equal(f.settings.app.kernel.lastWorkingSelection.branch, 'main')
  }
})

test('failed check cannot run the core; failed startup restores the persisted selection', async () => {
  for (const failure of ['check', 'run']) {
    const f = await fixture({ branch: 'official', officialVersion: '1.14.4' })
    f.settings.app.kernel.previousKernelSelection = {
      branch: 'custom',
      customPath: 'D:\\fixtures\\previous.exe',
    }
    f.fail(failure)
    await assert.rejects(f.store.startCore(), /previous core selection restored/)
    assert.equal(f.settings.app.kernel.branch, 'custom')
    assert.equal(f.settings.app.kernel.customPath, 'D:\\fixtures\\previous.exe')
    if (failure === 'check') assert.ok(!f.calls.some((c) => c[0] === 'run'))
    assert.equal(f.store.starting.value, false)
  }
})

test('reconnecting to a custom executable checks actual file identity and blocks unknown PIDs', async () => {
  const chosen = { branch: 'custom', customPath: 'D:\\fixtures\\renamed.exe' }
  const f = await fixture(chosen)
  f.pid(true)
  await f.store.initCoreState()
  assert.equal(f.store.running.value, true)
  assert.deepEqual(f.calls[0], ['identity', 777, chosen.customPath])
  assert.equal(f.calls.length, 1)
  const unknown = await fixture(chosen)
  unknown.settings.app.autoStartKernel = true
  unknown.pid(false)
  await assert.rejects(unknown.store.initCoreState(), /verify the process/)
  await assert.rejects(unknown.store.startCore(), /blocked/)
  await assert.rejects(unknown.store.stopCore(), /blocked/)
  assert.equal(unknown.calls.length, 1)
})
