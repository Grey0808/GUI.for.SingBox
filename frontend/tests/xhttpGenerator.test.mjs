import { strict as assert } from 'node:assert'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

import { parseCoreVersion } from '../src/utils/coreCapabilities.ts'
import { applyCustomModes } from '../src/utils/customModes.ts'
import { compatibleConfig } from '../src/utils/xhttpCompatibility.ts'

test('actual full config generator excludes XHTTP and repairs callback refs across core switches', async () => {
  const nativeRequire = createRequire(import.meta.url)
  const execute = async (path, requireFn) => {
    const text = await readFile(new URL(path, import.meta.url), 'utf8')
    const code = ts.transpileModule(text, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const exports = {}
    new Function('require', 'exports', code)(requireFn, exports)
    return exports
  }
  const enums = await execute('../src/enums/kernel.ts', nativeRequire)
  const appEnums = await execute('../src/enums/app.ts', nativeRequire)
  const x = {
    type: 'vless',
    tag: 'X',
    server: '192.0.2.1',
    server_port: 443,
    uuid: '00000000-0000-4000-8000-000000000001',
    transport: { type: 'xhttp', path: '/' },
  }
  const source = JSON.stringify([
    x,
    { type: 'socks', tag: 'S', server: '192.0.2.2', server_port: 1080 },
  ])
  const written = new Map()
  const capabilities = { facts: undefined, refresh: async () => capabilities.facts }
  const settings = { app: { kernel: { branch: 'main' } } }
  const modules = {
    '@/utils/customModes': { applyCustomModes },
    '@/utils/xhttpCompatibility': { compatibleConfig },
    '@/stores/coreCapabilities': { useCoreCapabilitiesStore: () => capabilities },
    '@/enums/kernel': enums,
    '@/enums/app': appEnums,
    '@/constant/kernel': { CoreConfigFilePath: 'fixture/config.json' },
    '@/bridge': {
      ReadFile: async () => source,
      WriteFile: async (path, text) => {
        written.set(path, text)
      },
    },
    '@/stores': {
      useAppSettingsStore: () => settings,
      useSubscribesStore: () => ({ getSubscribeById: () => ({ path: 'fixture/sub.json' }) }),
      useRulesetsStore: () => ({}),
      usePluginsStore: () => ({ onGenerateTrigger: async (config) => config }),
    },
    '@/utils': {
      deepClone: structuredClone,
      APP_TITLE: 'Fixture',
      createTextMatcher: () => () => true,
      deepAssign: (target, value) => Object.assign(target, value),
    },
  }
  const generator = await execute(
    '../src/utils/generator.ts',
    (name) => modules[name] ?? nativeRequire(name),
  )
  const profile = {
    log: { disabled: true },
    experimental: { clash_api: {}, cache_file: {} },
    inbounds: [],
    outbounds: [
      {
        id: 'group',
        tag: 'G',
        type: 'selector',
        include: '',
        exclude: '',
        outbounds: [{ type: 'Subscription', id: 'sub' }],
      },
    ],
    route: {
      final: 'group',
      rules: [],
      rule_set: [],
      auto_detect_interface: false,
      default_interface: '',
      default_domain_resolver: {},
    },
    dns: { servers: [], rules: [] },
    mixin: { priority: 'mixin', config: '{}' },
    script: { code: 'const onGenerate = async config => config' },
  }
  const previous = globalThis.window
  globalThis.window = { AsyncFunction: Object.getPrototypeOf(async function () {}).constructor }
  try {
    for (const version of ['1.14.4', '1.14.4-lx.33', '9.0.0-lx.1', '1.14.4-lx.33']) {
      capabilities.facts = {
        ...parseCoreVersion(
          `sing-box version ${version}\nTags: ${version.includes('lx') ? 'with_xhttp' : 'with_clash_api'}`,
        ),
        sha256: 'a'.repeat(64),
      }
      await generator.generateConfigFile(profile, async (config) => {
        config.route.rules.push({ action: 'route', domain: ['example.invalid'], outbound: 'X' })
        if (!config.outbounds.some((p) => p.tag === 'X')) config.outbounds.push(structuredClone(x)) // callback cannot bypass final filtering
        return config
      })
      const config = JSON.parse(written.get('fixture/config.json'))
      const compatible = version === '1.14.4-lx.33'
      assert.equal(
        config.outbounds.some((p) => p.tag === 'X'),
        compatible,
      )
      assert.deepEqual(
        config.outbounds.find((p) => p.tag === 'G').outbounds,
        compatible ? ['X', 'S'] : ['S'],
      )
      assert.equal(config.route.rules[0].outbound, compatible ? 'X' : 'S')
      assert.equal(config.route.final, 'G')
      assert.equal(config.route.default_domain_resolver, undefined)
      assert.ok(config.experimental && config.dns && config.http_clients)
      // Optional export for a separate, check-only integration pass; never run a core.
      if (process.env.SING_BOX_CHECK_DIRECTORY && ['1.14.4', '1.14.4-lx.33'].includes(version)) {
        assert.deepEqual(config.inbounds, [])
        assert.ok(!config.experimental.cache_file.enabled)
        assert.ok(!config.experimental.clash_api.external_controller)
        assert.deepEqual(config.route.rule_set || [], [])
        await writeFile(
          join(process.env.SING_BOX_CHECK_DIRECTORY, `${version}.json`),
          JSON.stringify(config, null, 2),
        )
      }
    }
    assert.equal(JSON.parse(source).length, 2)
    profile.customModes = [
      {
        id: 'work',
        name: 'Work',
        icon: '💼',
        outbound: 'group',
        rules: [{ domain_suffix: ['example.invalid'] }],
      },
    ]
    profile.selectedMode = 'Custom_work'
    await generator.generateConfigFile(profile, async (config) => config)
    const withModes = JSON.parse(written.get('fixture/config.json'))
    assert.equal(withModes.experimental.clash_api.default_mode, 'Custom_work')
    assert.equal(withModes.route.rules.find((r) => r.clash_mode === 'Custom_work').outbound, 'G')
    assert.ok(
      ['Rule', 'Global', 'Direct'].every((mode) =>
        withModes.route.rules.some((r) => r.clash_mode === mode),
      ),
    )
    if (process.env.SING_BOX_CHECK_DIRECTORY)
      await writeFile(
        join(process.env.SING_BOX_CHECK_DIRECTORY, 'lx-modes.json'),
        JSON.stringify(withModes, null, 2),
      )
    profile.dns.servers = [{ id: 'local', tag: 'local-dns', type: 'local' }]
    profile.route.default_domain_resolver.server = 'local'
    await generator.generateConfigFile(profile, async (config) => config)
    assert.deepEqual(JSON.parse(written.get('fixture/config.json')).route.default_domain_resolver, {
      server: 'local-dns',
    })
    profile.route.default_domain_resolver.server = 'missing'
    await assert.rejects(
      generator.generateConfigFile(profile, async (config) => config),
      /default DNS resolver is missing/,
    )
  } finally {
    globalThis.window = previous
  }
})
