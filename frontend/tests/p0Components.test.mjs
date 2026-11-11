import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { reactive } from 'vue'

import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'
import * as releases from '../src/utils/coreReleases.ts'
import * as selection from '../src/utils/coreSelection.ts'
import { switchClashMode, modeKey } from '../src/utils/customModes.ts'
import { xhttpUnavailableReason } from '../src/utils/xhttpCompatibility.ts'
import { coreInstallerFixture } from './helpers/coreInstallerFixture.mjs'
import {
  loadSource,
  mount,
  text,
  findAll,
  click,
  input,
  flush,
} from './helpers/vueComponentHarness.mjs'

const base = (errors) => ({
  'vue-i18n': { useI18n: () => ({ t: (value) => value }) },
  '@/utils': { message: { success() {}, error: (error) => errors.push(String(error)) } },
})
test('Official/LX settings templates wire install, selection, pin/delete protection and remount state to the real hook', async () => {
  for (const flavor of ['official', 'lx']) {
    const f = await coreInstallerFixture(flavor)
    const errors = []
    const Component = await loadSource(
      'views/SettingsView/components/components/LxCore.vue',
      { ...base(errors), '@/hooks/useCoreLx': { useCoreLx: f.createHook } },
      true,
    )
    let view = mount(Component, { flavor })
    try {
      await flush()
      assert.ok(
        text(view.root).includes(
          flavor === 'lx' ? 'sing-box-lx' : 'settings.kernel.managedOfficial',
        ),
      )
      await click(view.buttons('settings.kernel.lxInstall')[0])
      assert.equal(f.files.get(`${f.target}/libcronet.dll`), 'new dll')
      assert.equal(f.settings.app.kernel.branch, 'main')
      await click(view.buttons('settings.kernel.pin')[0])
      await click(view.buttons('common.delete')[0])
      assert.match(errors.pop(), /Unpin/)
      await click(view.buttons('settings.kernel.unpin')[0])
      await click(view.buttons('common.delete')[0])
      assert.equal(f.files.has(`${f.target}/sing-box.exe`), false)
      await click(view.buttons('settings.kernel.lxInstall')[0])
      await click(view.buttons('settings.kernel.lxUse')[0])
      assert.equal(f.settings.app.kernel.branch, flavor)
      await click(view.buttons('common.delete')[0])
      assert.match(errors.pop(), /Selected/)
      await click(view.buttons('settings.kernel.pin')[0])
      view.unmount()
      view = mount(Component, { flavor })
      await flush()
      assert.equal(view.buttons('settings.kernel.unpin').length, 1)
      assert.ok(text(view.root).includes(`settings.kernel.lxActive: ${f.version}`))
      assert.deepEqual(errors, [])
      assert.deepEqual(view.errors, [])
    } finally {
      view.unmount()
    }
  }
})

test('local executable template validates in place, displays errors, pins and restores the previous selection', async () => {
  const errors = []
  const settings = reactive({ app: { kernel: { branch: 'main' } } })
  const calls = []
  const modules = {
    ...base(errors),
    '@/bridge': {
      AbsolutePath: async (path) => path,
      FileExists: async () => true,
      FileSHA256: async () => 'a'.repeat(64),
      Exec: async (path, args) => {
        calls.push([path, args])
        return args[0] === 'version'
          ? 'sing-box version 1.14.4-lx.33\nTags: with_xhttp'
          : 'Usage: sing-box check [flags]'
      },
    },
    '@/stores': {
      useAppSettingsStore: () => settings,
      useKernelApiStore: () => ({ running: false }),
      useEnvStore: () => ({ env: { os: 'windows', arch: 'amd64' } }),
    },
    '@/utils/coreReleases': releases,
    '@/utils/coreSelection': selection,
    '@/utils/coreCapabilities': { parseCoreVersion },
  }
  modules['@/hooks/useLocalCore'] = await loadSource('hooks/useLocalCore.ts', modules)
  const Component = await loadSource(
    'views/SettingsView/components/components/LocalCore.vue',
    modules,
    true,
  )
  const view = mount(Component)
  try {
    await input(findAll(view.root, (node) => node.type === 'input')[0], 'D:\\fixtures\\local.exe')
    await click(view.buttons('settings.kernel.validateExecutable')[0])
    assert.ok(text(view.root).includes('1.14.4-lx.33'))
    await click(view.buttons('settings.kernel.lxUse')[0])
    assert.equal(settings.app.kernel.branch, 'custom')
    await click(view.buttons('settings.kernel.pin')[0])
    await click(view.buttons('settings.kernel.usePrevious')[0])
    assert.match(errors.pop(), /Unpin/)
    await click(view.buttons('settings.kernel.unpin')[0])
    await click(view.buttons('settings.kernel.usePrevious')[0])
    assert.equal(settings.app.kernel.branch, 'main')
    assert.ok(calls.every(([, args]) => ['version', 'check'].includes(args[0])))
    assert.deepEqual(errors, [])
    assert.deepEqual(view.errors, [])
  } finally {
    view.unmount()
  }
})

test('installer template reports checksum failure and cancellation through its visible Cancel button', async () => {
  const f = await coreInstallerFixture('official')
  const errors = []
  const Component = await loadSource(
    'views/SettingsView/components/components/LxCore.vue',
    { ...base(errors), '@/hooks/useCoreLx': { useCoreLx: f.createHook } },
    true,
  )
  const view = mount(Component, { flavor: 'official' })
  try {
    await flush()
    f.setFailure('checksum')
    await click(view.buttons('settings.kernel.lxInstall')[0])
    assert.match(errors.pop(), /SHA256 mismatch/)
    assert.equal(f.files.has(`${f.target}/sing-box.exe`), false)
    f.setFailure('')
    const download = f.modules['@/bridge'].Download
    const started = Promise.withResolvers()
    const finish = Promise.withResolvers()
    f.modules['@/bridge'].Download = async (...args) => {
      started.resolve()
      await finish.promise
      return download(...args)
    }
    const installing = click(view.buttons('settings.kernel.lxInstall')[0])
    await started.promise
    await flush()
    try {
      await click(view.buttons('common.cancel')[0])
    } finally {
      finish.resolve()
    }
    await installing
    assert.match(errors.pop(), /canceled/)
    assert.equal(f.files.has(`${f.target}/sing-box.exe`), false)
    assert.equal(f.files.get(`${f.old}/sing-box.exe`), 'old exe')
    assert.equal(f.settings.app.kernel.branch, 'main')
    assert.deepEqual(view.errors, [])
  } finally {
    view.unmount()
  }
})

test('ModeManager template validates, edits/reorders/deletes modes, persists on remount and uses verified mock API fallback', async () => {
  const errors = []
  const profile = reactive({
    id: 'profile',
    customModes: [],
    selectedMode: 'Rule',
    outbounds: [{ id: 'proxy', tag: 'Proxy' }],
  })
  let persisted
  let id = 0
  let submits = 0
  let actual = 'Rule'
  let ignorePatch = false
  const apiCalls = []
  const kernel = reactive({
    running: false,
    config: { mode: 'Rule' },
    updateConfig: async (_field, mode) => {
      const result = await switchClashMode(mode, {
        get: async () => {
          apiCalls.push('get')
          return {
            mode: actual,
            'mode-list': ['Rule', 'Global', 'Direct', ...profile.customModes.map(modeKey)],
          }
        },
        patch: async (value) => {
          apiCalls.push('patch')
          if (!ignorePatch) actual = value
        },
      })
      kernel.config.mode = result
    },
  })
  const modules = {
    ...base(errors),
    '@/stores': {
      useProfilesStore: () => ({
        getProfileById: () => profile,
        currentProfile: profile,
        saveProfiles: async () => {
          persisted = JSON.stringify(profile)
        },
      }),
      useKernelApiStore: () => kernel,
    },
    '@/utils/customModes': await import('../src/utils/customModes.ts'),
  }
  Object.assign(modules['@/utils'], { sampleID: () => `mode-${++id}` })
  const Component = await loadSource('views/HomeView/components/ModeManager.vue', modules, true)
  const open = () =>
    mount(
      Component,
      { profile },
      {
        submit: () => {
          submits++
        },
      },
    )
  let view = open()
  const fill = async (index, name) =>
    input(
      findAll(
        view.root,
        (node) => node.type === 'input' && node.props.placeholder === 'customModes.name',
      )[index],
      name,
    )
  try {
    await click(view.buttons('common.add')[0])
    await fill(0, 'Work')
    await click(view.buttons('common.add')[0])
    await fill(1, 'Games')
    await click(view.buttons('↑')[1])
    await input(findAll(view.root, (node) => node.type === 'textarea')[0], '{invalid')
    await click(view.buttons('common.save')[0])
    assert.equal(profile.customModes.length, 0)
    assert.ok(errors.pop())
    await input(findAll(view.root, (node) => node.type === 'textarea')[0], '[{"network":"tcp"}]')
    await click(view.buttons('common.save')[0])
    assert.deepEqual(
      profile.customModes.map((mode) => mode.name),
      ['Games', 'Work'],
    )
    assert.equal(submits, 1)
    view.unmount()
    Object.assign(profile, JSON.parse(persisted))
    view = open()
    await fill(0, 'Play')
    kernel.running = true
    kernel.config.mode = actual = modeKey(profile.customModes[1])
    await click(view.buttons('common.delete')[1])
    ignorePatch = true
    await click(view.buttons('common.save')[0])
    assert.deepEqual(
      profile.customModes.map((mode) => mode.name),
      ['Games', 'Work'],
    )
    assert.match(errors.pop(), /did not apply/)
    ignorePatch = false
    await click(view.buttons('common.save')[0])
    assert.deepEqual(
      profile.customModes.map((mode) => mode.name),
      ['Play'],
    )
    assert.equal(actual, 'Rule')
    assert.deepEqual(apiCalls, ['get', 'patch', 'get', 'get', 'patch', 'get'])
    assert.deepEqual(errors, [])
    assert.deepEqual(view.errors, [])
  } finally {
    view.unmount()
  }
})

test('outbound selection template shows XHTTP reason and refuses selection, then restores it on compatible facts without reimport', async () => {
  const facts = reactive({ value: undefined })
  const xhttp = { type: 'vless', tag: 'XHTTP', transport: { type: 'xhttp', path: '/' } }
  const subscription = {
    id: 'sub',
    name: 'Fixture',
    proxies: [
      { id: 'x', tag: 'XHTTP', type: 'vless' },
      { id: 's', tag: 'SOCKS', type: 'socks' },
    ],
  }
  const outbound = reactive({ id: 'group', tag: 'Proxy', type: 'selector', outbounds: [] })
  const modules = {
    ...base([]),
    '@/constant/kernel': { OutboundOptions: [], BuiltInOutbound: [] },
    '@/enums/kernel': { Outbound: { Selector: 'selector', Urltest: 'urltest' } },
    '@/stores': {
      useSubscribesStore: () => ({ subscribes: [subscription] }),
      useCoreCapabilitiesStore: () => ({
        reason: (id, tag) =>
          id === 'sub' && tag === 'XHTTP' ? xhttpUnavailableReason(xhttp, facts.value) : '',
      }),
    },
  }
  const Component = await loadSource(
    'views/ProfilesView/components/OutboundForm.vue',
    modules,
    true,
  )
  const view = mount(Component, { outbound, outbounds: [] })
  const x = () =>
    findAll(view.root, (node) => node.type === 'button' && text(node).startsWith('XHTTP'))[0]
  try {
    assert.equal(x().props.disabled, true)
    assert.ok(x().props.title)
    // Bypass pointer-level disabled protection to verify the handler's own guard too.
    await x().props.onClick({})
    await flush()
    assert.equal(outbound.outbounds.length, 0)
    facts.value = {
      ...parseCoreVersion('sing-box version 1.14.4-lx.33\nTags: with_xhttp'),
      sha256: 'a'.repeat(64),
    }
    await flush()
    assert.equal(Boolean(x().props.disabled), false)
    await click(x())
    assert.equal(outbound.outbounds[0].id, 'x')
    facts.value = {
      ...parseCoreVersion('sing-box version 1.14.4\nTags: with_clash_api'),
      sha256: 'a'.repeat(64),
    }
    await flush()
    assert.equal(x().props.disabled, true)
    assert.equal(subscription.proxies.length, 2)
    assert.deepEqual(view.errors, [])
  } finally {
    view.unmount()
  }
})
