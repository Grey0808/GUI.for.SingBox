import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'

test('reads reported LX features without assuming them from the name', () => {
  const result = parseCoreVersion('sing-box version 1.14.4-lx.33\nTags: with_quic,with_xhttp,with_clash_api')
  assert.equal(result.flavor, 'lx')
  assert.equal(result.xhttp, true)
  assert.equal(result.clashApi, true)
  assert.equal(parseCoreVersion('sing-box version 1.14.4-lx.33\nTags: with_quic').xhttp, false)
})

test('missing feature information remains unknown', () => {
  assert.equal(parseCoreVersion('sing-box version 1.13.0').xhttp, null)
  assert.equal(parseCoreVersion('unexpected output').flavor, 'unknown')
})
