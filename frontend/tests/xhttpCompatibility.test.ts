import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'
import { compatibleConfig, xhttpUnavailableReason } from '../src/utils/xhttpCompatibility.ts'

export const lxFacts = {
  ...parseCoreVersion('sing-box version 1.14.4-lx.33\nTags: with_xhttp,with_clash_api'),
  sha256: 'a'.repeat(64),
}
export const xhttp = {
  type: 'vless',
  tag: 'X',
  server: 'example.invalid',
  server_port: 443,
  uuid: '00000000-0000-4000-8000-000000000001',
  transport: { type: 'xhttp', path: '/', session_table: 'Base62', session_length: '16-32' },
}

test('XHTTP requires an identified binary, reported feature and known version schema', () => {
  assert.equal(xhttpUnavailableReason(xhttp, lxFacts), '')
  assert.ok(xhttpUnavailableReason(xhttp))
  assert.ok(xhttpUnavailableReason(xhttp, { ...lxFacts, version: 'unknown' }))
  assert.ok(xhttpUnavailableReason(xhttp, { ...lxFacts, xhttp: false }))
  assert.ok(xhttpUnavailableReason(xhttp, { ...lxFacts, sha256: undefined }))
  assert.ok(xhttpUnavailableReason({ ...xhttp, tls: { enabled: true, alpn: ['h3'] } }, lxFacts))
  assert.equal(
    xhttpUnavailableReason(
      { ...xhttp, tls: { enabled: true, alpn: ['h3'] } },
      { ...lxFacts, tags: [...lxFacts.tags, 'with_quic'] },
    ),
    '',
  )
  assert.ok(
    xhttpUnavailableReason(
      { ...xhttp, tls: { enabled: true, reality: { enabled: true } } },
      lxFacts,
    ),
  )
  assert.ok(
    xhttpUnavailableReason({ ...xhttp, transport: { type: 'xhttp', unsupported: true } }, lxFacts),
  )
})

test('filtering repairs groups and nested routing without mutating source; restores on compatible core', () => {
  const config = {
    outbounds: [
      xhttp,
      { type: 'socks', tag: 'S', server: 'example.invalid', server_port: 1080 },
      { type: 'selector', tag: 'G', default: 'X', outbounds: ['X', 'S'] },
    ],
    route: { final: 'X', rules: [{ type: 'logical', rules: [{ outbound: 'X' }] }] },
    dns: { servers: [{ type: 'tcp', detour: 'X' }] },
    http_clients: [{ tag: 'http', detour: 'X' }],
  }
  const before = JSON.stringify(config)
  const result = compatibleConfig(config)
  assert.equal(result.route.final, 'S')
  assert.equal(result.route.rules[0].rules[0].outbound, 'S')
  assert.deepEqual(result.outbounds[1].outbounds, ['S'])
  assert.equal(result.outbounds[1].default, 'S')
  assert.equal(result.dns.servers[0].detour, 'S')
  assert.equal(result.http_clients[0].detour, 'S')
  assert.equal(JSON.stringify(config), before)
  assert.equal(compatibleConfig(config, lxFacts).outbounds.length, 3)
})

test('no implicit direct bypass when all proxy routes are incompatible', () => {
  assert.throws(
    () => compatibleConfig({ outbounds: [xhttp, { type: 'direct', tag: 'direct' }] }),
    /no compatible proxy route/,
  )
  assert.throws(
    () =>
      compatibleConfig({
        outbounds: [xhttp, { type: 'selector', tag: 'G', outbounds: ['X'] }],
        route: { final: 'G' },
      }),
    /no compatible proxy route/,
  )
})
