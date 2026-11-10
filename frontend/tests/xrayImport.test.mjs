import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'

import { readSubscriptionMetadata } from '../src/utils/subscriptionMetadata.ts'
import { convertXraySubscription } from '../src/utils/xrayConverter.ts'
import { mixedXray } from './fixtures/xrayMixed.ts'

test('URL import and periodic update use the native converter, preserve metadata and IDs, and reject loss', async () => {
  const files = new Map()
  let body = JSON.stringify(mixedXray)
  let status = 200
  let calls = 0
  let id = 0
  const request = async ({ url }) => {
    assert.equal(url, 'https://subscription.example.invalid/configs')
    return {
      status,
      body,
      headers: {
        'Subscription-Userinfo': 'upload=1; download=2; total=100; expire=2000000000',
        'Profile-Title': 'Example',
        'Support-Url': 'https://support.example.invalid',
      },
    }
  }
  const nativeRequire = createRequire(import.meta.url)
  const modules = {
    pinia: { defineStore: (_id, setup) => setup },
    vue: { ref: (value) => ({ value }) },
    '@/utils/xrayConverter': { convertXraySubscription },
    '@/utils/subscriptionMetadata': { readSubscriptionMetadata },
    '@/bridge': {
      Requests: request,
      ReadFile: async (path) => files.get(path),
      WriteFile: async (path, text) => {
        files.set(path, text)
        return 'ok'
      },
    },
    '@/constant/app': {
      SubscribesFilePath: 'fixture/settings.json',
      DefaultSubscribeScript:
        'const onSubscribe = async (proxies, subscription) => ({proxies, subscription})',
    },
    '@/constant/kernel': { DefaultExcludeProtocols: '' },
    '@/enums/app': {
      PluginTriggerEvent: { OnSubscribe: 'onSubscribe' },
      RequestMethod: { Get: 'GET' },
      RequestProxyMode: { Global: 'global' },
    },
    '@/stores': {
      usePluginsStore: () => ({
        onSubscribeTrigger: async (proxies) => {
          calls++
          if (proxies[0]?.base64)
            return [
              {
                type: 'socks',
                tag: 'From Base64 plugin',
                server: 'example.invalid',
                server_port: 1080,
              },
            ]
          if (proxies[0]?.name)
            return proxies.map((p) => ({
              type: 'socks',
              tag: p.name,
              server: 'example.invalid',
              server_port: 1080,
            }))
          assert.ok(proxies.every((p) => p.type && !p.protocol))
          return proxies
        },
      }),
    },
    '@/utils': {
      sampleID: () => `fixture-${++id}`,
      isValidSubJson: (text) => {
        try {
          return !!JSON.parse(text).outbounds
        } catch {
          return false
        }
      },
      isValidSubYAML: (text) => text.startsWith('proxies:'),
      isValidBase64: (text) => text === 'fixture-base64',
      stringifyNoFolding: JSON.stringify,
      omitArray: (items, keys) =>
        items.map((item) =>
          Object.fromEntries(Object.entries(item).filter(([key]) => !keys.includes(key))),
        ),
      eventBus: { emit() {} },
      GetRequestProxy: async () => '',
      migrateSubscribes: async () => {},
      asyncPool: async (_limit, items, fn) =>
        Promise.all(items.map(async (item) => ({ ok: true, value: await fn(item) }))),
    },
  }
  const source = await readFile(new URL('../src/stores/subscribes.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', code)((name) => modules[name] ?? nativeRequire(name), exports)
  const previous = globalThis.window
  globalThis.window = { AsyncFunction: Object.getPrototypeOf(async function () {}).constructor }
  try {
    const store = exports.useSubscribesStore()
    const subscription = store.getSubscribeTemplate('My unchanged title', {
      url: 'https://subscription.example.invalid/configs',
    })
    await store.addSubscribe(subscription)
    await store.updateSubscribe(subscription.id)
    const proxies = JSON.parse(files.get(subscription.path))
    assert.equal(proxies.length, 4)
    assert.equal(proxies[1].transport.type, 'xhttp')
    assert.equal(subscription.name, 'My unchanged title')
    assert.equal(subscription.metadata.profileTitle, 'Example')
    assert.equal(subscription.download, 2)
    assert.equal(JSON.parse(files.get(subscription.path + '.xray.json')).sources.length, 5)
    const ids = subscription.proxies.map((p) => p.id)
    await store.updateSubscribe(subscription.id)
    assert.deepEqual(
      subscription.proxies.map((p) => p.id),
      ids,
    )
    await store.updateSubscribes()
    assert.deepEqual(
      subscription.proxies.map((p) => p.id),
      ids,
    )
    const saved = files.get(subscription.path)
    status = 500
    await assert.rejects(store.updateSubscribe(subscription.id), /HTTP 500/)
    assert.equal(files.get(subscription.path), saved)
    status = 200
    const invalid = structuredClone(mixedXray)
    invalid[0].outbounds[0].streamSettings.sockopt = { unknownOption: true }
    body = JSON.stringify(invalid)
    await assert.rejects(
      store.updateSubscribe(subscription.id),
      /unsupported field streamSettings.sockopt/,
    )
    assert.equal(files.get(subscription.path), saved)
    body = JSON.stringify({
      outbounds: [{ type: 'socks', tag: 'Existing', server: 'example.invalid', server_port: 1080 }],
    })
    await store.updateSubscribe(subscription.id)
    assert.equal(JSON.parse(files.get(subscription.path))[0].tag, 'Existing')
    body = 'proxies:\n  - name: From YAML plugin'
    await store.updateSubscribe(subscription.id)
    assert.equal(JSON.parse(files.get(subscription.path))[0].tag, 'From YAML plugin')
    body = 'fixture-base64'
    await store.updateSubscribe(subscription.id)
    assert.equal(JSON.parse(files.get(subscription.path))[0].tag, 'From Base64 plugin')
    assert.equal(calls, 6)
    const original = JSON.stringify(mixedXray)
    files.set('fixture/source.json', original)
    const fileSub = store.getSubscribeTemplate('Local source')
    Object.assign(fileSub, {
      type: 'File',
      url: 'fixture/source.json',
      path: 'fixture/source.json',
    })
    await store.addSubscribe(fileSub)
    await store.updateSubscribe(fileSub.id)
    assert.equal(files.get('fixture/source.json'), original)
    assert.notEqual(fileSub.path, fileSub.url)
    assert.equal(JSON.parse(files.get(fileSub.path)).length, 4)
  } finally {
    globalThis.window = previous
  }
})
