import { expect, test } from 'vitest'
import { bootLines } from './bootLines'

test('boot log looks like systemd and ends at the graphical target', () => {
  const lines = bootLines()
  expect(lines.length).toBeGreaterThanOrEqual(15)
  expect(lines[0].startsWith('[  OK  ]') || lines[0].startsWith('Welcome to')).toBe(true)
  expect(lines.at(-1)).toContain('Graphical Interface')
  expect(lines.filter((l) => l.startsWith('[  OK  ]')).length).toBeGreaterThanOrEqual(12)
})
