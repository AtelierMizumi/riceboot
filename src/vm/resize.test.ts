import { expect, test } from 'vitest'
import { sttyCommand } from './resize'

test('sttyCommand formats and clamps the size', () => {
  expect(sttyCommand(120, 40)).toBe('stty cols 120 rows 40\n')
  expect(sttyCommand(0, 5000)).toBe('stty cols 1 rows 1000\n')
})
