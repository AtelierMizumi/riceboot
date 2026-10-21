import { expect, test } from 'vitest'
import { overlayAction } from './overlayPolicy'

test('no stored overlay starts empty', () => {
  expect(overlayAction(null, 'b1')).toBe('start-empty')
})

test('same build restores the overlay', () => {
  expect(overlayAction('b1', 'b1')).toBe('restore')
})

test('different build asks before discarding', () => {
  expect(overlayAction('b0', 'b1')).toBe('ask-discard')
})
