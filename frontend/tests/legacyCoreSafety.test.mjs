import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'
import { coreReleaseSources } from '../src/utils/coreReleases.ts'
import * as selection from '../src/utils/coreSelection.ts'

async function fixture() {
  const settings = { app: { kernel: { branch: 'main' } } }
  const kernel = { running: false }
  const errors = []
  const moves = []
  let reads = 0
  let race = false
  const modules = {
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
    '@/bridge': {
      Exec: async () => 'sing-box version 1.14.4',
      FileExists: async () => {
        if (race && ++reads === 3) kernel.starting = true
        return true
      },
      PathsReferToSameFile: async () => true,
      HttpGet: async () => ({
        body: {
          tag_name: 'v1.14.4',
          assets: [
            {
              name: 'release.zip',
              digest: `sha256:${'a'.repeat(64)}`,
              browser_download_url: 'fixture',
              uploader: { login: 'github-actions[bot]' },
            },
          ],
        },
      }),
      MakeDir: async () => {},
      Download: async () => {},
      RemoveFile: async () => {},
      UnzipZIPFile: async () => {},
      MoveFile: async (...args) => {
        moves.push(args)
      },
    },
    '@/constant/kernel': { CoreWorkingDirectory: 'fixture/core' },
    '@/enums/app': { Branch: { Main: 'main', Alpha: 'alpha' }, OS: { Windows: 'windows' } },
    '@/utils/coreCapabilities': { parseCoreVersion },
    '@/utils/coreReleases': { coreReleaseSources },
    '@/utils/coreSelection': selection,
    '@/stores': {
      useAppSettingsStore: () => settings,
      useEnvStore: () => ({ env: { os: 'windows' } }),
      useKernelApiStore: () => kernel,
    },
    '@/utils': {
      getKernelFileName: () => 'core.exe',
      getKernelAssetFileName: () => 'release.zip',
      getGitHubApiAuthorization: () => '',
      confirm: async () => {},
      debounce: (fn) => fn,
      message: {
        warn() {},
        success() {},
        error: (e) => {
          errors.push(e)
        },
      },
    },
  }
  const source = await readFile(new URL('../src/hooks/useCoreBranch.ts', import.meta.url), 'utf8')
  const exports = {}
  new Function(
    'require',
    'exports',
    'console',
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )(
    (name) => {
      assert.ok(modules[name], name)
      return modules[name]
    },
    exports,
    { log() {} },
  )
  return {
    hook: exports.useCoreBranch(),
    settings,
    kernel,
    errors,
    moves,
    race: () => {
      race = true
    },
  }
}

test('legacy updater respects main pin and custom-path alias pins, including rollback', async () => {
  for (const chosen of [{ branch: 'main' }, { branch: 'custom', customPath: 'D:\\alias.exe' }]) {
    const f = await fixture()
    selection.setCorePinned(f.settings.app.kernel, chosen, true)
    await f.hook.downloadCore()
    assert.match(f.errors[0], /Unpin/)
    await assert.rejects(f.hook.rollbackCore(), /Unpin/)
    assert.equal(f.moves.length, 0)
  }
})

test('legacy overwrite/rollback cannot touch a custom executable in use under another branch', async () => {
  for (const state of ['running', 'starting', 'stopping']) {
    const f = await fixture()
    f.settings.app.kernel.branch = 'custom'
    f.kernel[state] = true
    await f.hook.downloadCore()
    assert.match(f.errors[0], /Stop the running core/)
    await assert.rejects(f.hook.rollbackCore(), /Stop the core/)
    assert.equal(f.moves.length, 0)
  }
})

test('legacy rollback rechecks process transitions after asynchronous pin validation', async () => {
  const f = await fixture()
  f.race()
  await assert.rejects(f.hook.rollbackCore(), /Stop the core/)
  assert.equal(f.moves.length, 0)
  selection.assertCoreAvailable({ branch: 'main' })
})
