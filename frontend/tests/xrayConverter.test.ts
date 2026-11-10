import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { convertXraySubscription } from '../src/utils/xrayConverter.ts'
import { mixedXray } from './fixtures/xrayMixed.ts'

test('converts complete mixed configs with groups, preserves distinct exits and deduplicates exact connections', () => {
  const before = JSON.stringify(mixedXray)
  const result = convertXraySubscription(before)!
  assert.equal(result.outbounds.length, 4)
  assert.equal(result.sources.length, 5)
  assert.deepEqual(result.aliases[0]?.groups, ['AUTO'])
  assert.equal(result.aliases[2]?.tag, 'EU-Vision')
  assert.equal(result.outbounds[0]?.flow, 'xtls-rprx-vision')
  assert.equal(
    result.outbounds[0]?.tls.reality.public_key,
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  )
  assert.equal(result.outbounds[1]?.transport.session_length, '16-32')
  assert.equal(result.outbounds[1]?.transport.x_padding_bytes, '100-1000')
  assert.equal(result.outbounds[1]?.transport.xmux.h_keep_alive_period, 45)
  assert.equal(result.outbounds[3]?.type, 'hysteria2')
  assert.equal(result.outbounds[3]?.password, 'fixture-password')
  assert.equal(JSON.stringify(mixedXray), before)
  assert.ok(result.outbounds.every((v) => !('routing' in v) && !('source' in v)))
  result.outbounds[3]!.tls.alpn.push('test')
  assert.deepEqual((result.sources[4]!.source as any).streamSettings.tlsSettings.alpn, ['h3'])
})

test('supports current flat VLESS settings and retains names when endpoints collide', () => {
  const outbound = {
    protocol: 'vless',
    tag: 'Original name',
    settings: {
      address: 'example.invalid',
      port: 8443,
      id: '00000000-0000-4000-8000-000000000001',
      encryption: 'none',
    },
  }
  const result = convertXraySubscription(
    JSON.stringify({
      outbounds: [outbound, { ...outbound, settings: { ...outbound.settings, port: 9443 } }],
    }),
  )!
  assert.deepEqual(
    result.outbounds.map((v) => v.tag),
    ['Original name', 'Original name (2)'],
  )
  assert.deepEqual(
    result.aliases.map((v) => v.original),
    ['Original name', 'Original name'],
  )
})

test('rejects unknown fields and malformed transport types without exposing values', () => {
  const invalid = structuredClone(mixedXray) as any
  invalid[0].outbounds[1].streamSettings.xhttpSettings.extra.downloadSettings = {
    secret: 'never-print-this',
  }
  assert.throws(
    () => convertXraySubscription(JSON.stringify(invalid)),
    /unsupported field xhttp.downloadSettings/,
  )
  delete invalid[0].outbounds[1].streamSettings.xhttpSettings.extra.downloadSettings
  invalid[0].outbounds[1].streamSettings.xhttpSettings.extra.xPaddingBytes = true
  assert.throws(() => convertXraySubscription(JSON.stringify(invalid)), /invalid range/)
})

test('existing formats are left to the existing pipeline', () => {
  assert.equal(convertXraySubscription('{"outbounds":[{"type":"direct","tag":"direct"}]}'), null)
  assert.equal(convertXraySubscription('proxies: []'), null)
})
