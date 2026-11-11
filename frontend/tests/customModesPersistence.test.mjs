import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'

import { validateModes } from '../src/utils/customModes.ts'

test('actual profile store persists mode CRUD, ordering and selection without restart events', async () => {
  let saved = ''
  const events = []
  const nativeRequire = createRequire(import.meta.url)
  const modules = {
    pinia: { defineStore: (_id, setup) => setup },
    vue: {
      ref: (value) => ({ value }),
      computed: (fn) => ({
        get value() {
          return fn()
        },
      }),
    },
    '@/bridge': {
      ReadFile: async () => saved,
      WriteFile: async (_path, value) => {
        saved = value
        return 'ok'
      },
    },
    '@/constant/app': { ProfilesFilePath: 'fixture/profiles.yaml' },
    '@/constant/profile': {},
    '@/stores': { useAppSettingsStore: () => ({ app: { kernel: { profile: 'profile' } } }) },
    '@/utils': {
      stringifyNoFolding: JSON.stringify,
      ignoredError: async (fn, ...args) => fn(...args),
      migrateProfiles: async () => {},
      eventBus: { emit: (name) => events.push(name) },
    },
  }
  const source = await readFile(new URL('../src/stores/profiles.ts', import.meta.url), 'utf8')
  const exports = {}
  new Function(
    'require',
    'exports',
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )((name) => modules[name] ?? nativeRequire(name), exports)
  const store = exports.useProfilesStore()
  const profile = { id: 'profile', name: 'Fixture', customModes: [] }
  await store.addProfile(profile)
  profile.customModes.push(
    { id: 'one', name: 'Work', icon: '💼', outbound: 'proxy', rules: [] },
    { id: 'two', name: 'Home', icon: '⌂', outbound: 'proxy', rules: [{ network: 'tcp' }] },
  )
  validateModes(profile.customModes)
  await store.saveProfiles()
  profile.customModes[0].name = 'Renamed'
  profile.customModes.reverse()
  profile.selectedMode = 'Custom_one'
  await store.saveProfiles()
  const reloaded = exports.useProfilesStore()
  await reloaded.setupProfiles()
  assert.deepEqual(
    reloaded.profiles.value[0].customModes.map((m) => m.id),
    ['two', 'one'],
  )
  assert.equal(reloaded.profiles.value[0].selectedMode, 'Custom_one')
  reloaded.profiles.value[0].customModes.splice(0, 1)
  await reloaded.saveProfiles()
  assert.equal(JSON.parse(saved)[0].customModes[0].name, 'Renamed')
  assert.deepEqual(events, [])
})
