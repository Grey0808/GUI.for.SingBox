import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as pinia from 'pinia'
import * as vue from 'vue'
import * as yaml from 'yaml'

import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'
import { readSubscriptionMetadata } from '../src/utils/subscriptionMetadata.ts'
import { xhttpUnavailableReason } from '../src/utils/xhttpCompatibility.ts'
import { convertXraySubscription } from '../src/utils/xrayConverter.ts'
import { mockSubscriptionServer } from './helpers/mockSubscriptionServer.mjs'
import {
  loadSource,
  controls,
  mount,
  findAll,
  text,
  input,
  click,
  flush,
} from './helpers/vueComponentHarness.mjs'

test('subscription form imports local HTTP Xray via the real store and renders preserved nodes/reasons after store recreation', async (t) => {
  const fixture = await mockSubscriptionServer()
  t.after(() => fixture.close())
  const files = new Map()
  const errors = []
  const facts = vue.ref()
  let ids = 0
  let store
  let pluginCalls = 0
  const enums = await loadSource('enums/app.ts', {})
  const constants = {
    DefaultSubscribeScript:
      'const onSubscribe = async (proxies, subscription) => ({ proxies, subscription })',
    SubscribesFilePath: 'fixture/subscribes.yaml',
    RequestMethodOptions: [],
    SubscriptionRequestProxyModeOptions: [],
  }
  const bridge = {
    ReadFile: async (path) => files.get(path),
    WriteFile: async (path, data) => {
      assert.match(path, /^(fixture\/|data\/subscribes\/)/)
      files.set(path, data)
      return 'ok'
    },
    Requests: async ({ url, options }) => {
      assert.equal(options.Proxy, '')
      assert.ok(url.startsWith(fixture.base + '/'), 'External request forbidden')
      const response = await fetch(url)
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      }
    },
  }
  const utils = {
    sampleID: () => `fixture-${++ids}`,
    deepClone: (value) => JSON.parse(JSON.stringify(value)),
    isValidSubJson: (value) => {
      try {
        return !!JSON.parse(value).outbounds
      } catch {
        return false
      }
    },
    isValidSubYAML: () => false,
    isValidBase64: () => false,
    stringifyNoFolding: yaml.stringify,
    ignoredError: async (fn, ...args) => {
      try {
        return await fn(...args)
      } catch {
        return undefined
      }
    },
    omitArray: (items, keys) =>
      items.map((item) =>
        Object.fromEntries(Object.entries(item).filter(([key]) => !keys.includes(key))),
      ),
    asyncPool: async (_count, items, fn) =>
      Promise.all(items.map(async (value) => ({ ok: true, value: await fn(value) }))),
    eventBus: { emit() {} },
    migrateSubscribes: async () => {},
    GetRequestProxy: async () => '',
    buildSmartRegExp: (pattern, flags) => new RegExp(pattern, flags),
    message: { success() {}, error: (error) => errors.push(String(error)) },
  }
  const modules = {
    pinia,
    yaml,
    '@/bridge': bridge,
    '@/constant/app': constants,
    '@/constant/kernel': { DefaultExcludeProtocols: '' },
    '@/enums/app': enums,
    '@/utils': utils,
    '@/utils/xrayConverter': { convertXraySubscription },
    '@/utils/subscriptionMetadata': { readSubscriptionMetadata },
    '@/components/Button/index.vue': { __esModule: true, default: controls.Button },
    '@/components/CodeEditor/index.vue': { __esModule: true, default: controls.CodeEditor },
    '@/components/CodeViewer/index.vue': { __esModule: true, default: controls.CodeViewer },
    'vue-i18n': { useI18n: () => ({ t: (value) => value }) },
    '@/stores': {
      usePluginsStore: () => ({
        onSubscribeTrigger: async (proxies) => {
          pluginCalls++
          return proxies
        },
      }),
      useSubscribesStore: () => store,
      useAppSettingsStore: () => ({ app: { requestProxyMode: 'none' } }),
      useCoreCapabilitiesStore: () => ({
        reason: (_id, tag) =>
          xhttpUnavailableReason(
            JSON.parse(files.get(store.subscribes[0].path)).find((node) => node.tag === tag) || {},
            facts.value,
          ),
      }),
    },
  }
  modules['@/hooks'] = await loadSource('hooks/useBool.ts', modules)
  pinia.setActivePinia(pinia.createPinia())
  const { useSubscribesStore } = await loadSource('stores/subscribes.ts', modules)
  store = useSubscribesStore()
  const Form = await loadSource('views/SubscribesView/components/SubscribeForm.vue', modules, true)
  let submitted = 0
  const form = mount(
    Form,
    {},
    {
      cancel() {},
      submit: () => {
        submitted++
      },
    },
  )
  t.after(form.unmount)
  await input(findAll(form.root, (node) => node.type === 'input')[0], 'Anonymized subscription')
  await input(
    findAll(
      form.root,
      (node) => node.type === 'input' && node.props.placeholder === 'http(s)://',
    )[0],
    fixture.url,
  )
  const footer = mount(vue.defineComponent(() => () => form.vm.modalSlots.submit()))
  t.after(footer.unmount)
  await click(footer.buttons('common.save')[0])
  assert.equal(submitted, 1)
  assert.equal(store.subscribes.length, 1)
  const sub = store.subscribes[0]
  const previousWindow = globalThis.window
  globalThis.window = { AsyncFunction: Object.getPrototypeOf(async function () {}).constructor }
  t.after(() => {
    globalThis.window = previousWindow
  })
  await store.updateSubscribe(sub.id, { requestProxyMode: 'none' })
  assert.equal(fixture.hits(), 1)
  assert.equal(sub.proxies.length, 4)
  assert.equal(sub.metadata.profileTitle, 'Local acceptance fixture')
  assert.equal(JSON.parse(files.get(sub.path + '.xray.json')).sources.length, 5)
  const saved = files.get(sub.path)
  await assert.rejects(
    store.updateSubscribe(sub.id, { url: fixture.base + '/error', requestProxyMode: 'none' }),
    /HTTP 503/,
  )
  assert.equal(files.get(sub.path), saved)
  const proxyIDs = sub.proxies.map((node) => node.id)
  await store.updateSubscribe(sub.id, { requestProxyMode: 'none' })
  assert.deepEqual(
    sub.proxies.map((node) => node.id),
    proxyIDs,
  )
  assert.equal(pluginCalls, 2)
  // Dispose Pinia stores and reload actual saved YAML into a new instance.
  store.$dispose()
  pinia.setActivePinia(pinia.createPinia())
  store = useSubscribesStore()
  await store.setupSubscribes()
  assert.deepEqual(
    store.subscribes[0].proxies.map((node) => node.id),
    proxyIDs,
  )
  const Proxies = await loadSource('views/SubscribesView/components/ProxiesView.vue', modules, true)
  const view = mount(Proxies, { sub: store.subscribes[0] }, { cancel() {}, submit() {} })
  t.after(view.unmount)
  assert.equal(findAll(view.root, (node) => node.type === 'card').length, 4)
  assert.ok(text(view.root).includes('XHTTP'))
  const xTag = JSON.parse(files.get(store.subscribes[0].path)).find(
    (node) => node.transport?.type === 'xhttp',
  ).tag
  const xCard = () =>
    findAll(view.root, (node) => node.type === 'card' && node.props.title === xTag)[0]
  assert.match(xCard().props.class, /opacity-50/)
  const requestsBefore = fixture.hits()
  facts.value = {
    ...parseCoreVersion('sing-box version 1.14.4-lx.33\nTags: with_xhttp,with_utls'),
    sha256: 'a'.repeat(64),
  }
  await flush()
  assert.ok(!xCard().props.class?.includes('opacity-50'))
  assert.equal(fixture.hits(), requestsBefore)
  assert.equal(JSON.parse(files.get(store.subscribes[0].path)).length, 4)
  assert.deepEqual(form.errors, [])
  assert.deepEqual(footer.errors, [])
  assert.deepEqual(view.errors, [])
  assert.deepEqual(errors, [])
})
