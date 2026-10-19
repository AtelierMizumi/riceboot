import { expect, test } from 'vitest'
import { isVmSupported } from './runtime'

test('unsupported when WebAssembly is missing', () => {
  expect(isVmSupported({})).toBe(false)
})

test('supported when WebAssembly exists', () => {
  expect(isVmSupported({ WebAssembly: {} })).toBe(true)
})
