import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'
import * as paths from '../src/utils/coreReleases.ts'
import * as selection from '../src/utils/coreSelection.ts'

async function fixture() {
  const settings = { app: { kernel: { branch: 'main' } } }
  const kernel = { running: false, starting: false, stopping: false, restarting: false }
  const calls = []
  let error = ''
  let race = false
  let hashes = 0
  const modules = {
    vue: {
      ref: (value) => ({ value }),
      computed: (fn) => ({
        get value() {
          return fn()
        },
      }),
    },
    '@/stores': {
      useAppSettingsStore: () => settings,
      useKernelApiStore: () => kernel,
      useEnvStore: () => ({ env: { os: 'windows', arch: 'amd64' } }),
    },
    // Deliberately no write/copy/delete/process-start API in this fixture.
    '@/bridge': {
      AbsolutePath: async (path) => path,
      FileExists: async () => error !== 'missing',
      FileSHA256: async () => {
        hashes++
        return error === 'changed' ? `${hashes}` : 'a'.repeat(64)
      },
      Exec: async (path, args) => {
        calls.push([path, args])
        if (race) kernel.starting = true
        if (error === 'exec') throw Error('not executable')
        if (args[0] === 'version')
          return error === 'version'
            ? 'unrelated program'
            : 'sing-box version 1.14.4-lx.33\nTags: with_xhttp'
        assert.deepEqual(args, ['check', '--help'])
        return error === 'check' ? 'unknown command' : 'Usage:\n  sing-box check [flags]'
      },
    },
    '@/utils/coreCapabilities': { parseCoreVersion },
    '@/utils/coreReleases': paths,
    '@/utils/coreSelection': selection,
  }
  const source = await readFile(new URL('../src/hooks/useLocalCore.ts', import.meta.url), 'utf8')
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
  const hook = exports.useLocalCore()
  hook.path.value = 'C:\\fixtures\\renamed-core.exe'
  return {
    hook,
    settings,
    kernel,
    calls,
    fail: (value) => {
      error = value
    },
    race: () => {
      race = true
    },
  }
}

test('custom executable is inspected in place, persisted, pinned and explicitly restored without copying', async () => {
  const f = await fixture()
  await f.hook.activate()
  assert.deepEqual(
    f.calls.map((c) => c[1]),
    [['version'], ['check', '--help']],
  )
  assert.equal(f.settings.app.kernel.branch, 'custom')
  const saved = JSON.parse(JSON.stringify(f.settings.app.kernel))
  assert.equal(paths.selectedCorePath(saved, 'windows'), f.hook.path.value)
  f.hook.pin()
  await assert.rejects(f.hook.rollback(), /Unpin/)
  f.hook.pin()
  await f.hook.rollback()
  assert.equal(f.settings.app.kernel.branch, 'main')
  assert.equal(f.settings.app.kernel.previousKernelSelection, undefined)
})

test('custom validation errors and process transitions cannot change the active selection', async () => {
  for (const error of ['missing', 'exec', 'version', 'check', 'changed']) {
    const f = await fixture()
    f.fail(error)
    await assert.rejects(f.hook.activate())
    assert.equal(f.settings.app.kernel.branch, 'main', error)
    assert.equal(f.hook.busy.value, false)
  }
  const f = await fixture()
  f.race()
  await assert.rejects(f.hook.activate(), /Stop the core/)
  assert.equal(f.settings.app.kernel.branch, 'main')
})

test('explicit rollback after a successful launch targets the saved working Official version', async () => {
  const f = await fixture()
  f.settings.app.kernel.branch = 'lx'
  f.settings.app.kernel.lxVersion = '1.14.4-lx.33'
  f.settings.app.kernel.lastWorkingSelection = { branch: 'official', officialVersion: '1.14.4' }
  await f.hook.rollback()
  assert.equal(f.settings.app.kernel.branch, 'official')
  assert.equal(f.settings.app.kernel.officialVersion, '1.14.4')
  assert.equal(f.settings.app.kernel.previousKernelSelection.branch, 'lx')
  assert.equal(f.calls[0][0], 'data/sing-box/versions/official/1.14.4/sing-box.exe')
})
