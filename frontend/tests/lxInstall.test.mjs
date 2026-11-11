import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import * as coreSelection from '../src/utils/coreSelection.ts'
import { coreInstallerFixture as fixture } from './helpers/coreInstallerFixture.mjs'

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

test('Official versions use the same verified installer, separate storage and explicit selection', async () => {
  const f = await fixture('official')
  await f.hook.refreshReleases()
  await f.hook.install()
  assert.equal(f.files.get(`${f.target}/libcronet.dll`), 'new dll')
  assert.equal(f.files.get(`${f.old}/sing-box.exe`), 'old exe')
  assert.equal(f.settings.app.kernel.branch, 'main')
  await f.hook.activate()
  assert.equal(f.settings.app.kernel.branch, 'official')
  assert.equal(f.settings.app.kernel.officialVersion, '1.14.4')
  assert.equal(coreSelection.restorePreviousCore(f.settings.app.kernel), true)
  assert.equal(f.settings.app.kernel.branch, 'main')
})

test('pin persists through settings serialization and prevents switching and deletion until unpinned', async () => {
  const f = await fixture('official')
  await f.hook.refreshReleases()
  await f.hook.install()
  f.hook.pin()
  assert.equal(f.hook.pinned.value, true)
  assert.equal(
    coreSelection.isCorePinned(JSON.parse(JSON.stringify(f.settings.app.kernel)), {
      branch: 'official',
      officialVersion: f.version,
    }),
    true,
  )
  await assert.rejects(f.hook.remove(), /Unpin/)
  await f.hook.activate()
  assert.throws(() => coreSelection.selectCore(f.settings.app.kernel, { branch: 'main' }), /Unpin/)
  f.hook.pin()
  coreSelection.selectCore(f.settings.app.kernel, { branch: 'main' })
  delete f.settings.app.kernel.previousKernelSelection
  await f.hook.remove()
  assert.equal(f.files.has(`${f.target}/sing-box.exe`), false)
  assert.equal(f.files.get(`${f.old}/sing-box.exe`), 'old exe')
})

test('deletion protects selected, pending/working rollback versions and all process transitions', async () => {
  for (const flavor of ['lx', 'official']) {
    const f = await fixture(flavor)
    await f.hook.refreshReleases()
    await f.hook.install()
    const chosen =
      flavor === 'lx'
        ? { branch: 'lx', lxVersion: f.version }
        : { branch: 'official', officialVersion: f.version }
    for (const key of ['previousKernelSelection', 'lastWorkingSelection']) {
      f.settings.app.kernel[key] = chosen
      await assert.rejects(f.hook.remove(), /rollback/i)
      delete f.settings.app.kernel[key]
    }
    for (const key of ['running', 'starting', 'stopping', 'restarting']) {
      f.kernel[key] = true
      await assert.rejects(f.hook.remove(), /Stop the core/)
      f.kernel[key] = false
    }
    await f.hook.activate()
    await assert.rejects(f.hook.remove(), /Selected/)
    assert.equal(f.files.get(`${f.target}/sing-box.exe`), 'new exe')
  }
})

test('deletion locks its target across awaits, blocking activation, startup and pin races', async () => {
  const f = await fixture()
  await f.hook.refreshReleases()
  await f.hook.install()
  let checked = false
  const chosen = { branch: 'lx', lxVersion: f.version }
  f.onRead((path) => {
    if (path !== f.target) return
    checked = true
    assert.throws(() => coreSelection.selectCore(f.settings.app.kernel, chosen), /operation/)
    assert.throws(() => coreSelection.assertCoreAvailable(chosen), /operation/)
    assert.throws(
      () => coreSelection.setCorePinned(f.settings.app.kernel, chosen, true),
      /operation/,
    )
  })
  await f.hook.remove()
  assert.equal(checked, true)
  coreSelection.assertCoreAvailable(chosen)
  assert.equal(f.files.has(`${f.target}/sing-box.exe`), false)
})

test('a custom-path alias of a managed executable also protects the version from deletion', async () => {
  const f = await fixture()
  await f.hook.refreshReleases()
  await f.hook.install()
  f.files.set('C:\\alias.exe', 'new exe')
  f.settings.app.kernel.branch = 'custom'
  f.settings.app.kernel.customPath = 'C:\\alias.exe'
  await assert.rejects(f.hook.remove(), /Custom selected/)
  assert.equal(f.files.get(`${f.target}/sing-box.exe`), 'new exe')
})
