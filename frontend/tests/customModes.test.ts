import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  applyCustomModes,
  modeDefinitionMatches,
  modeKey,
  rulesForMode,
  switchClashMode,
  validateModes,
  type CustomMode,
} from '../src/utils/customModes.ts'

const mode: CustomMode = {
  id: 'fixture',
  name: 'Work',
  icon: '💼',
  outbound: 'proxy-id',
  rules: [],
}
const outbounds = [{ id: 'proxy-id', tag: 'proxy' }]
const config = {
  outbounds: [{ tag: 'proxy', type: 'socks', server: '192.0.2.1', server_port: 1080 }],
  route: {
    final: 'proxy',
    rules: [
      { action: 'hijack-dns', protocol: 'dns' },
      { action: 'route', domain: ['example.invalid'], outbound: 'proxy' },
    ],
  },
  experimental: { clash_api: {} },
}

test('custom mode priority preserves DNS and standard modes, rules and active selection survive generation', () => {
  const result = applyCustomModes(config, [mode], outbounds, modeKey(mode))
  assert.equal(result.route.rules[0].action, 'hijack-dns')
  assert.equal(result.route.rules[1].clash_mode, modeKey(mode))
  assert.ok(
    ['Rule', 'Global', 'Direct'].every((name) =>
      result.route.rules.some((r: any) => r.clash_mode === name),
    ),
  )
  assert.equal(result.experimental.clash_api.default_mode, modeKey(mode))
  assert.ok(modeDefinitionMatches(mode, outbounds, result))
  assert.deepEqual(applyCustomModes(result, [mode], outbounds, modeKey(mode)), result)
  assert.equal(
    modeDefinitionMatches(
      { ...mode, rules: [{ domain_suffix: ['example.invalid'] }] },
      outbounds,
      result,
    ),
    false,
  )
  assert.deepEqual(config.route.rules.length, 2)
  assert.equal(
    applyCustomModes(config, [mode], outbounds, 'global').experimental.clash_api.default_mode,
    'Global',
  )
  const renamed = { ...mode, name: 'Renamed', icon: '⚙' }
  assert.equal(modeDefinitionMatches(renamed, outbounds, result), true)
})

test('missing or excluded mode target fails closed without a dangling outbound reference', () => {
  const unavailable = { ...mode, outbound: 'deleted-id' }
  const result = applyCustomModes(config, [unavailable], outbounds, modeKey(unavailable))
  assert.equal(result.experimental.clash_api.default_mode, 'Rule')
  const rule = result.route.rules.find((r: any) => r.clash_mode === modeKey(unavailable))
  assert.equal(rule.action, 'reject')
  assert.equal(rule.outbound, undefined)
  assert.equal(modeDefinitionMatches(unavailable, outbounds, result), false)
  assert.ok(rulesForMode(mode, outbounds, new Set()).error)
})

test('CRUD validation rejects collisions, reserved names and unsafe routing fields', () => {
  validateModes([mode])
  assert.throws(() => validateModes([mode, { ...mode, id: 'other', name: 'work' }]), /unique/)
  assert.throws(() => validateModes([{ ...mode, name: 'Rule' }]), /cannot be/)
  assert.throws(
    () => validateModes([mode, { ...mode, id: mode.id.toUpperCase(), name: 'Other' }]),
    /duplicate mode ID/,
  )
  assert.throws(
    () => validateModes([{ ...mode, rules: [{ outbound: 'arbitrary' }] }]),
    /Unsupported/,
  )
  assert.throws(() => validateModes([{ ...mode, rules: [{ port: 70000 }] }]), /Invalid/)
  const other = {
    ...mode,
    id: 'second',
    name: 'Second',
    rules: [{ domain_suffix: ['example.invalid'] }],
  }
  const result = applyCustomModes(config, [other, mode], outbounds)
  assert.deepEqual(
    result.route.rules
      .filter((r: any) => r.clash_mode?.startsWith('Custom_'))
      .map((r: any) => r.clash_mode),
    [modeKey(other), modeKey(mode)],
  )
  assert.equal(applyCustomModes(config, [], outbounds).route.rules.length, 2)
})

test('mock Clash API verifies registration and readback; failures never report success', async () => {
  let actual = 'Rule'
  const calls: string[] = []
  const api = {
    get: async () => {
      calls.push('get')
      return { mode: actual, 'mode-list': ['Rule', modeKey(mode)] }
    },
    patch: async (value: string) => {
      calls.push('patch')
      actual = value
    },
  }
  assert.equal(await switchClashMode(modeKey(mode), api), modeKey(mode))
  assert.deepEqual(calls, ['get', 'patch', 'get'])
  await assert.rejects(switchClashMode('missing', api), /not loaded/)
  await assert.rejects(switchClashMode('Rule', { ...api, patch: async () => {} }), /did not apply/)
  await assert.rejects(
    switchClashMode('Rule', {
      ...api,
      patch: async () => {
        throw Error('HTTP 500')
      },
    }),
    /HTTP 500/,
  )
  assert.equal(
    await switchClashMode('Direct', {
      get: async () => ({ mode: 'Direct' }),
      patch: async () => {},
    }),
    'Direct',
  )
})
