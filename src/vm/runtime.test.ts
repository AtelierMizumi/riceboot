import { expect, test } from 'vitest'
import { isVmSupported } from './runtime'

test('unsupported when WebAssembly is missing', () => {
  expect(isVmSupported({})).toBe(false)
})

test('unsupported when WebAssembly exists but cannot reserve the VM memory', () => {
  const failing = { Memory: function () { throw new RangeError('out of memory') } }
  expect(isVmSupported({ WebAssembly: failing })).toBe(false)
})

test('supported when WebAssembly can reserve the VM memory', () => {
  expect(isVmSupported({ WebAssembly })).toBe(true)
})
