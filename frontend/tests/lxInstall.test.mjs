import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'
import {
  coreReleaseSources,
  lxCoreDirectory,
  lxCorePath,
  sha256FromSums,
  windowsAmd64AssetName,
} from '../src/utils/coreReleases.ts'
import { selectLX } from '../src/utils/coreSelection.ts'

async function fixture() {
  const version = '1.14.4-lx.34'
  const old = lxCoreDirectory('1.14.4-lx.33')
  const target = lxCoreDirectory(version)
  const files = new Map([
    [`${old}/sing-box.exe`, 'old exe'],
    [`${old}/libcronet.dll`, 'old dll'],
  ])
  const dirs = new Set([old])
  const settings = { app: { kernel: { branch: 'main', lxVersion: '1.14.4-lx.33' } } }
  const kernel = { running: false, starting: false, stopping: false, restarting: false }
  const env = { env: { os: 'windows', arch: 'amd64' } }
  let failure = ''
  let cancel = false
  let useSums = false
  let startDuringRead = false
  let hook
  const assetName = windowsAmd64AssetName(version)
  const base = `https://github.com/Leadaxe/sing-box-lx/releases/download/v${version}/`
  const bridge = {
    FileExists: async (path) => {
      if (startDuringRead && path === lxCorePath(version)) kernel.starting = true
      return files.has(path) || dirs.has(path)
    },
    MakeDir: async (path) => {
      dirs.add(path)
    },
    ReadDir: async (root) =>
      [
        ...new Set(
          [...dirs, ...files.keys()]
            .filter((p) => p.startsWith(root + '/'))
            .map((p) => p.slice(root.length + 1).split('/')[0]),
        ),
      ].map((name) => ({ name, isDir: true })),
    HttpGet: async (url) =>
      url.endsWith('/SHA256SUMS')
        ? { status: 200, body: `${'a'.repeat(64)}  ${assetName}` }
        : {
            status: failure === 'network' ? 503 : 200,
            body: [
              {
                tag_name: `v${version}`,
                draft: false,
                assets: [
                  {
                    name: assetName,
                    browser_download_url: base + assetName,
                    digest: useSums ? null : `sha256:${'a'.repeat(64)}`,
                  },
                  { name: 'SHA256SUMS', browser_download_url: base + 'SHA256SUMS' },
                ],
              },
            ],
          },
    Download: async (_url, path, _headers, _progress, options) => {
      assert.equal(options.Sha256, 'a'.repeat(64))
      if (failure === 'checksum') throw Error('SHA256 mismatch')
      if (failure === 'download') throw Error('download failed')
      files.set(path, 'archive')
      if (cancel) hook.cancel() // Also test cancellation racing with successful completion.
    },
    HttpCancel: () => {},
    UnzipZIPFile: async (_archive, stage) => {
      if (failure === 'archive') throw Error('invalid archive')
      const unpacked = `${stage}/${assetName.slice(0, -4)}`
      dirs.add(unpacked)
      if (failure !== 'missing') files.set(`${unpacked}/sing-box.exe`, 'new exe')
      files.set(`${unpacked}/libcronet.dll`, 'new dll')
      files.set(`${unpacked}/README.md`, 'readme')
    },
    Exec: async (path, args) => {
      assert.ok(path.startsWith('data/.cache/'))
      assert.deepEqual(args, ['version'])
      return `sing-box version ${failure === 'version' ? 'invalid' : version}`
    },
    MoveFile: async (source, dest) => {
      if (failure === 'rename') throw Error('rename failed')
      assert.equal(dest, target)
      for (const [path, value] of [...files])
        if (path.startsWith(source + '/')) {
          files.set(dest + path.slice(source.length), value)
          files.delete(path)
        }
      dirs.add(dest)
      dirs.delete(source)
    },
    RemoveFile: async (root) => {
      assert.ok(root.startsWith('data/.cache/lx-install-'))
      for (const path of [...files.keys()]) if (path.startsWith(root + '/')) files.delete(path)
      for (const path of [...dirs])
        if (path === root || path.startsWith(root + '/')) dirs.delete(path)
    },
  }
  const modules = {
    vue: {
      ref: (value) => ({ value }),
      computed: (fn) => ({
        get value() {
          return fn()
        },
      }),
    },
    '@/bridge': bridge,
    '@/enums/app': { Branch: { Lx: 'lx' } },
    '@/stores': {
      useAppSettingsStore: () => settings,
      useKernelApiStore: () => kernel,
      useEnvStore: () => env,
    },
    '@/utils/coreCapabilities': { parseCoreVersion },
    '@/utils/coreReleases': {
      coreReleaseSources,
      lxCoreDirectory,
      lxCorePath,
      sha256FromSums,
      windowsAmd64AssetName,
    },
    '@/utils/coreSelection': { selectLX },
  }
  const source = await readFile(new URL('../src/hooks/useCoreLx.ts', import.meta.url), 'utf8')
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
  hook = exports.useCoreLx()
  return {
    hook,
    files,
    dirs,
    settings,
    kernel,
    env,
    old,
    target,
    version,
    setFailure: (value) => {
      failure = value
    },
    setCancel: () => {
      cancel = true
    },
    setSums: () => {
      useSums = true
    },
    setStartRace: () => {
      startDuringRead = true
    },
  }
}

test('actual LX installer preserves the complete archive and previous version, and selects only explicitly', async () => {
  const f = await fixture()
  f.setSums()
  await f.hook.refreshReleases()
  await f.hook.install()
  assert.equal(f.files.get(`${f.target}/libcronet.dll`), 'new dll')
  assert.equal(f.files.get(`${f.target}/README.md`), 'readme')
  assert.equal(f.files.get(`${f.old}/sing-box.exe`), 'old exe')
  assert.equal(f.settings.app.kernel.branch, 'main')
  f.kernel.running = true
  await assert.rejects(f.hook.activate(), /Stop the core/)
  assert.equal(f.settings.app.kernel.branch, 'main')
  f.kernel.running = false
  await f.hook.activate()
  assert.equal(f.settings.app.kernel.branch, 'lx')
  assert.equal(f.settings.app.kernel.lxVersion, f.version)
  assert.equal(f.settings.app.kernel.previousKernelSelection.branch, 'main')
  assert.ok(![...f.files.keys()].some((p) => p.includes('/.cache/')))
  await assert.rejects(f.hook.install(), /already installed/)
  assert.equal(f.files.get(`${f.old}/sing-box.exe`), 'old exe')
})

test('all failed install phases and cancellation leave the working version intact', async () => {
  for (const failure of [
    'checksum',
    'download',
    'archive',
    'missing',
    'version',
    'rename',
    'cancel',
  ]) {
    const f = await fixture()
    await f.hook.refreshReleases()
    if (failure === 'cancel') f.setCancel()
    else f.setFailure(failure)
    await assert.rejects(f.hook.install())
    assert.equal(f.files.get(`${f.old}/sing-box.exe`), 'old exe', failure)
    assert.equal(f.files.get(`${f.old}/libcronet.dll`), 'old dll', failure)
    assert.equal(f.files.has(`${f.target}/sing-box.exe`), false, failure)
    assert.equal(f.hook.busy.value, false)
    assert.equal(f.settings.app.kernel.branch, 'main')
    assert.ok(![...f.files.keys()].some((p) => p.includes('/.cache/')))
  }
})

test('selection rejects a core becoming active during asynchronous path validation', async () => {
  const f = await fixture()
  await f.hook.refreshReleases()
  await f.hook.install()
  f.setStartRace()
  await assert.rejects(f.hook.activate(), /state changed/)
  assert.equal(f.settings.app.kernel.branch, 'main')
})

test('network errors and unsupported platforms fail without installing anything', async () => {
  const f = await fixture()
  f.setFailure('network')
  await assert.rejects(f.hook.refreshReleases(), /HTTP 503/)
  f.env.env.os = 'linux'
  await assert.rejects(f.hook.install(), /Windows AMD64/)
})
