import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { parseXraySubscription } from '../src/utils/xraySubscription.ts'

test('distinguishes existing formats and extracts Xray configuration arrays losslessly', () => {
  assert.equal(parseXraySubscription('{"outbounds":[{"type":"vless","tag":"old"}]}'), null)
  assert.equal(parseXraySubscription('proxies: []'), null)
  const source = {
    protocol: 'vless',
    tag: 'proxy-a',
    settings: {
      vnext: [{ address: 'example.invalid', port: 443, users: [{ id: 'fixture-only' }] }],
    },
    streamSettings: { network: 'xhttp', xhttpSettings: { sessionIDLength: '16-32' } },
  }
  const result = parseXraySubscription(
    JSON.stringify([
      {
        routing: {
          rules: [{ outboundTag: 'direct' }],
          balancers: [{ tag: 'AUTO', selector: ['proxy-'], strategy: { type: 'leastLoad' } }],
        },
        outbounds: [source, { protocol: 'freedom', tag: 'direct' }],
      },
      {
        outbounds: [
          {
            ...source,
            tag: 'other',
            settings: {
              vnext: [
                { address: 'example.invalid', port: 443, users: [{ id: 'different-fixture' }] },
              ],
            },
          },
        ],
      },
    ]),
  )!
  assert.equal(result.length, 2)
  assert.deepEqual(result[0]?.groups, ['AUTO'])
  assert.deepEqual(result[0]?.source, source)
  assert.deepEqual(result[1]?.groups, [])
})

test('preserves tagless inputs for existing conversion plugins and rejects malformed entries', () => {
  assert.equal(parseXraySubscription('{"outbounds":[{"protocol":"vless"}]}')?.[0]?.tag, '')
  assert.throws(() => parseXraySubscription('{"outbounds":[{"protocol":"vless","tag":"x"},{}]}'))
})
