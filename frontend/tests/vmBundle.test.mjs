import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'

import { inspectPE } from '../../tools/vm/pe.mjs'
import { validateSafeSettings } from '../../tools/vm/verify-bundle.mjs'

test('VM packaging rejects unsafe defaults, source-machine paths and invalid Plugin Hub fixtures', () => {
  const core = {
    env: {},
    args: [
      'run',
      '--disable-color',
      '-c',
      '$APP_DATA_PATH/sing-box/config.json',
      '-D',
      '$APP_DATA_PATH/sing-box',
    ],
  }
  const safe = {
    autoStartKernel: false,
    autoRestartKernel: false,
    autoSetSystemProxy: false,
    autoSetSystemDNS: false,
    closeKernelOnExit: false,
    rollingRelease: false,
    multipleInstance: false,
    requestProxyMode: 'none',
    githubApiToken: '',
    pluginSettings: {},
    plugins: { sources: [{ url: 'https://example.invalid/gfs.json' }] },
    kernel: { branch: 'main', profile: '', main: core, alpha: core },
  }
  validateSafeSettings(safe)
  for (const mutate of [
    (s) => {
      s.autoStartKernel = true
    },
    (s) => {
      s.kernel.customPath = 'G:\\working\\core.exe'
    },
    (s) => {
      s.plugins.sources[0].url = 'https://example.invalid/undefined.json'
    },
    (s) => {
      s.kernel.main.args[3] = 'G:\\working\\config.json'
    },
    (s) => {
      s.githubApiToken = 'fixture-token'
    },
  ]) {
    const invalid = structuredClone(safe)
    mutate(invalid)
    assert.throws(() => validateSafeSettings(invalid))
  }
})

test('PE dependency inspection reads metadata without loading or executing a program', () => {
  assert.throws(() => inspectPE(Buffer.from('not an executable')))
  const bytes = Buffer.alloc(512)
  bytes.write('MZ')
  bytes.writeUInt32LE(64, 60)
  bytes.write('PE\0\0', 64)
  bytes.writeUInt16LE(0x8664, 68)
  bytes.writeUInt16LE(240, 84)
  bytes.writeUInt16LE(0x20b, 88)
  bytes.writeUInt16LE(2, 156)
  assert.deepEqual(inspectPE(bytes), { machine: '8664', subsystem: 2, imports: [] })
})

test(
  'Windows built-in PowerShell fixture serves real loopback JSON/metadata and exits without a GUI/core',
  { skip: process.platform !== 'win32', timeout: 15000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'singbox-vm-fixtures-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const exported = spawn(
      process.execPath,
      ['--experimental-strip-types', resolve('../tools/vm/export-fixtures.mjs'), directory],
      { windowsHide: true },
    )
    assert.equal((await once(exported, 'exit'))[0], 0)
    const server = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('../tools/vm/Serve-Subscription.ps1'),
        '-FixtureDirectory',
        directory,
        '-RequestLimit',
        '3',
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const exited = once(server, 'exit')
    let stderr = ''
    server.stderr.on('data', (bytes) => {
      stderr += bytes
    })
    const lines = createInterface({ input: server.stdout })
    let url
    for await (const line of lines) {
      if (line.startsWith('Fixture URL: ')) {
        url = line.slice(13)
        break
      }
    }
    assert.ok(url?.startsWith('http://127.0.0.1:'))
    const response = await fetch(url)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('profile-title'), 'Local acceptance fixture')
    assert.equal(await response.text(), await readFile(join(directory, 'xray-mixed.json'), 'utf8'))
    assert.equal((await fetch(url.replace('/xray.json', '/sing-box.json'))).status, 200)
    assert.equal((await fetch(url.replace('/xray.json', '/error'))).status, 503)
    assert.equal((await exited)[0], 0, stderr)
  },
)
