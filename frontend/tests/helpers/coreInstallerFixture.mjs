import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as vue from 'vue'

import { parseCoreVersion } from '../../src/utils/coreCapabilities.ts'
import {
  coreReleaseSources,
  coreVersionDirectory,
  managedCorePath,
  sha256FromSums,
  windowsAmd64AssetName,
} from '../../src/utils/coreReleases.ts'
import * as coreSelection from '../../src/utils/coreSelection.ts'

export async function coreInstallerFixture(flavor = 'lx') {
  const version = flavor === 'lx' ? '1.14.4-lx.34' : '1.14.4'
  const old = coreVersionDirectory(flavor, flavor === 'lx' ? '1.14.4-lx.33' : '1.14.3')
  const target = coreVersionDirectory(flavor, version)
  const files = new Map([
    [`${old}/sing-box.exe`, 'old exe'],
    [`${old}/libcronet.dll`, 'old dll'],
  ])
  const dirs = new Set([old])
  const settings = vue.reactive({ app: { kernel: { branch: 'main', lxVersion: '1.14.4-lx.33' } } })
  const kernel = vue.reactive({
    running: false,
    starting: false,
    stopping: false,
    restarting: false,
  })
  const env = vue.reactive({ env: { os: 'windows', arch: 'amd64' } })
  let failure = ''
  let cancel = false
  let useSums = false
  let startDuringRead = false
  let onRead = () => {}
  let hook
  const assetName = windowsAmd64AssetName(version)
  const base = `${coreReleaseSources[flavor].page}/download/v${version}/`
  const bridge = {
    PathsReferToSameFile: async (first, second) => first === second || first === 'C:\\alias.exe',
    FileExists: async (path) => {
      onRead(path)
      if (startDuringRead && path === managedCorePath(flavor, version)) kernel.starting = true
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
      for (const [path, value] of files)
        if (path.startsWith(source + '/')) {
          files.set(dest + path.slice(source.length), value)
          files.delete(path)
        }
      dirs.add(dest)
      dirs.delete(source)
    },
    RemoveFile: async (root) => {
      assert.ok(root.startsWith(`data/.cache/${flavor}-install-`) || root === target)
      for (const path of files.keys()) if (path.startsWith(root + '/')) files.delete(path)
      for (const path of dirs) if (path === root || path.startsWith(root + '/')) dirs.delete(path)
    },
  }
  const modules = {
    vue,
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
      coreVersionDirectory,
      managedCorePath,
      sha256FromSums,
      windowsAmd64AssetName,
    },
    '@/utils/coreSelection': coreSelection,
  }
  const source = await readFile(new URL('../../src/hooks/useCoreLx.ts', import.meta.url), 'utf8')
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
  hook = exports.useCoreLx(flavor)
  return {
    hook,
    modules,
    createHook: (...args) => {
      hook = exports.useCoreLx(...args)
      return hook
    },
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
    onRead: (callback) => {
      onRead = callback
    },
  }
}
