import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  selectCore,
  selectLX,
  restorePreviousCore,
  setCorePinned,
  isCorePinned,
  type KernelSelection,
} from '../src/utils/coreSelection.ts'

test('failed LX selection restores the last known selection, even after multiple choices', () => {
  const kernel: {
    branch: 'main' | 'alpha' | 'lx'
    lxVersion?: string
    previousKernelSelection?: { branch: 'main' | 'alpha' | 'lx'; lxVersion?: string }
  } = { branch: 'main' }
  selectLX(kernel, '1.14.4-lx.33')
  selectLX(kernel, '1.14.4-lx.34')
  assert.equal(restorePreviousCore(kernel), true)
  assert.equal(kernel.branch, 'main')
  assert.equal(kernel.lxVersion, undefined)
  assert.equal(restorePreviousCore(kernel), false)
})

test('pin guards every selection variant and unpin survives settings serialization', () => {
  for (const initial of [
    { branch: 'main' },
    { branch: 'alpha' },
    { branch: 'official', officialVersion: '1.14.4' },
    { branch: 'custom', customPath: 'D:\\local\\core.exe' },
    { branch: 'lx', lxVersion: '1.14.4-lx.33' },
  ] as KernelSelection[]) {
    const kernel = structuredClone(initial)
    setCorePinned(kernel, kernel, true)
    const loaded = JSON.parse(JSON.stringify(kernel))
    assert.equal(isCorePinned(loaded), true)
    selectCore(loaded, initial)
    assert.throws(
      () => selectCore(loaded, { branch: initial.branch === 'main' ? 'alpha' : 'main' }),
      /Unpin/,
    )
    setCorePinned(loaded, loaded, false)
    assert.equal(isCorePinned(loaded), false)
    selectCore(loaded, { branch: initial.branch === 'main' ? 'alpha' : 'main' })
    assert.equal(restorePreviousCore(loaded), true)
    assert.equal(loaded.branch, initial.branch)
    assert.equal(loaded.customPath, initial.customPath)
    assert.equal(loaded.officialVersion, initial.officialVersion)
  }
})

test('failed switch back to official keeps the working LX selection', () => {
  const kernel: {
    branch: 'main' | 'alpha' | 'lx'
    lxVersion?: string
    previousKernelSelection?: { branch: 'main' | 'alpha' | 'lx'; lxVersion?: string }
  } = { branch: 'lx', lxVersion: '1.14.4-lx.33' }
  selectCore(kernel, { branch: 'main' })
  assert.equal(restorePreviousCore(kernel), true)
  assert.equal(kernel.branch, 'lx')
  assert.equal(kernel.lxVersion, '1.14.4-lx.33')
})
