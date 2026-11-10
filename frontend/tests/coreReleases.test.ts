import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  coreReleaseSources,
  lxCorePath,
  sha256FromSums,
  windowsAmd64AssetName,
} from '../src/utils/coreReleases.ts'

test('selects exact Windows assets for official and LX releases', () => {
  assert.equal(windowsAmd64AssetName('v1.14.4-lx.33'), 'sing-box-1.14.4-lx.33-windows-amd64.zip')
  assert.equal(windowsAmd64AssetName('v1.13.0'), 'sing-box-1.13.0-windows-amd64.zip')
  assert.match(
    coreReleaseSources.lx.api,
    /^https:\/\/api\.github\.com\/repos\/Leadaxe\/sing-box-lx\//,
  )
  assert.throws(() => windowsAmd64AssetName('../release'))
  assert.equal(lxCorePath('v1.14.4-lx.33'), 'data/sing-box/versions/lx/1.14.4-lx.33/sing-box.exe')
  assert.throws(() => lxCorePath('v1.14.4'))
  assert.throws(() => lxCorePath('../escape'))
})

test('selects only an exact, unambiguous checksum entry', () => {
  const hash = 'a'.repeat(64)
  assert.equal(
    sha256FromSums(`${hash}  archive.zip\n${'b'.repeat(64)}  archive.zip.extra`, 'archive.zip'),
    hash,
  )
  assert.throws(() => sha256FromSums(`${hash}  archive.zip\n${hash}  archive.zip`, 'archive.zip'))
  assert.throws(() => sha256FromSums('', 'archive.zip'))
})
