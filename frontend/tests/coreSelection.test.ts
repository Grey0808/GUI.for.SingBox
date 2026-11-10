import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { selectCore, selectLX, restorePreviousCore } from '../src/utils/coreSelection.ts'

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
