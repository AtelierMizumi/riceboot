import { expect, test } from 'vitest'
import { shouldRestartAfterReset } from './resetPolicy'

test('reset restarts the VM only when it is running or loading or failed', () => {
  expect(shouldRestartAfterReset('linux')).toBe(true)
  expect(shouldRestartAfterReset('loading')).toBe(true)
  expect(shouldRestartAfterReset('error')).toBe(true)
  expect(shouldRestartAfterReset('shell')).toBe(false)
})
