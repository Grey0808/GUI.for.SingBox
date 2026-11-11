import { strict as assert } from 'node:assert'
import { readFile, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import * as yaml from 'yaml'

import { selectedCorePath } from '../src/utils/coreReleases.ts'
import { selectCore, setCorePinned, isCorePinned } from '../src/utils/coreSelection.ts'

test('actual settings store and migration preserve managed/custom selections, pin and rollback through YAML reload', async () => {
  let saved = ''
  const watches = []
  const execute = async (file, modules) => {
    const exports = {}
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
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
    return exports
  }
  const enums = await execute('../src/enums/app.ts', {})
  const kernelEnums = await execute('../src/enums/kernel.ts', {})
  const stores = {
    useAppStore: () => ({ loadLocales: async () => {} }),
    useEnvStore: () => ({ env: { os: 'windows' } }),
  }
  const constants = {
    ...(await execute('../src/constant/app.ts', {
      '@/enums/app': enums,
      '@/utils': { APP_TITLE: 'GUI.for.SingBox' },
    })),
    UserFilePath: 'fixture/user.yaml',
  }
  const coreConstants = await execute('../src/constant/kernel.ts', {
    '@/enums/kernel': kernelEnums,
  })
  const migration = await execute('../src/utils/migration.ts', {
    '@/constant/app': constants,
    '@/enums/app': enums,
    '@/enums/kernel': kernelEnums,
    '@/stores': stores,
  })
  const modules = {
    pinia: { defineStore: (_id, setup) => setup },
    vue: {
      ref: (value) => ({ value }),
      watch: (source, callback) => {
        watches.push([source, callback])
      },
    },
    yaml,
    '@/bridge': {
      ReadFile: async (path) => {
        assert.equal(path, constants.UserFilePath)
        return saved
      },
      WriteFile: async (path, text) => {
        assert.equal(path, constants.UserFilePath)
        saved = text
        return text
      },
      GetSystemProxyBypass: async () => 'fixture-only',
    },
    '@/constant/app': constants,
    '@/constant/kernel': {
      ...coreConstants,
      DefaultCoreConfig: () => ({
        ...coreConstants.DefaultCoreConfig(),
        args: coreConstants
          .DefaultCoreConfig()
          .args.map((arg) => arg.replaceAll('$APP_DATA_PATH/', '$APP_BASE_PATH/data/')),
      }),
    },
    '@/enums/app': enums,
    '@/lang': {
      __esModule: true,
      default: { global: { locale: { value: 'en' }, availableLocales: ['en'] } },
    },
    '@/stores': stores,
    '@/utils': {
      debounce: (fn) => Object.assign((...args) => Promise.resolve(fn(...args)), { cancel() {} }),
      ignoredError: async (fn, ...args) => {
        try {
          return await fn(...args)
        } catch {
          return undefined
        }
      },
      deepClone: structuredClone,
      migrateAppSettings: migration.migrateAppSettings,
    },
  }
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
  }
  globalThis.document = {
    documentElement: { style: { setProperty() {} } },
    body: { setAttribute() {}, style: {} },
  }
  try {
    const { useAppSettingsStore } = await execute('../src/stores/appSettings.ts', modules)
    let store = useAppSettingsStore()
    await store.setupAppSettings()
    assert.ok(
      store.app.value.plugins.sources.some((source) => source.url.endsWith('/gfs.json?ref=main')),
    )
    assert.ok(store.app.value.plugins.sources.every((source) => !source.url.includes('undefined')))
    if (process.env.SING_BOX_TEST_SETTINGS_OUTPUT) {
      const safe = structuredClone(store.app.value)
      Object.assign(safe, {
        autoStartKernel: false,
        autoRestartKernel: false,
        autoSetSystemProxy: false,
        autoSetSystemDNS: false,
        closeKernelOnExit: false,
        rollingRelease: false,
        requestProxyMode: enums.RequestProxyMode.None,
        proxyBypassList: '',
      })
      await writeFile(process.env.SING_BOX_TEST_SETTINGS_OUTPUT, yaml.stringify(safe))
    }
    for (const chosen of [
      { branch: 'official', officialVersion: '1.14.4' },
      { branch: 'lx', lxVersion: '1.14.4-lx.33' },
      { branch: 'custom', customPath: 'D:\\fixtures\\local.exe' },
      { branch: 'alpha' },
      { branch: 'main' },
    ]) {
      selectCore(store.app.value.kernel, chosen)
      setCorePinned(store.app.value.kernel, chosen, true)
      const onChange = watches.find(([source]) => source === store.app)[1]
      onChange(store.app.value)
      await Promise.resolve()
      store = useAppSettingsStore()
      await store.setupAppSettings()
      assert.equal(store.app.value.kernel.branch, chosen.branch)
      assert.equal(
        selectedCorePath(store.app.value.kernel, 'windows'),
        selectedCorePath(chosen, 'windows'),
      )
      assert.equal(isCorePinned(store.app.value.kernel), true)
      assert.equal(store.app.value.kernel.previousKernelSelection.branch, 'main')
      assert.ok(store.app.value.kernel.main.args.includes('$APP_DATA_PATH/sing-box/config.json'))
      setCorePinned(store.app.value.kernel, chosen, false)
    }
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})
