import { expect, test } from 'vitest'
import { cubicBezier } from './bezier'

test('endpoints are fixed', () => {
  const ease = cubicBezier(0.05, 0.9, 0.1, 1.05)
  expect(ease(0)).toBe(0)
  expect(ease(1)).toBe(1)
})

test('linear curve is identity', () => {
  const lin = cubicBezier(0, 0, 1, 1)
  for (const t of [0.1, 0.5, 0.9]) expect(lin(t)).toBeCloseTo(t, 3)
})

test('hyprland default curve is fast-out', () => {
  expect(cubicBezier(0.05, 0.9, 0.1, 1.05)(0.5)).toBeGreaterThan(0.9)
})

test('ease-in is slow at start', () => {
  expect(cubicBezier(0.42, 0, 1, 1)(0.25)).toBeLessThan(0.15)
})
