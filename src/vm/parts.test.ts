import { expect, test } from 'vitest'
import { CHUNK, partName, splitParts } from './parts'

test('partName follows the v86 use_parts scheme', () => {
  expect(CHUNK).toBe(1048576)
  expect(partName('rice', '.img', 0)).toBe('rice-0-1048576.img')
  expect(partName('rice', '.img', 3 * CHUNK)).toBe('rice-3145728-4194304.img')
})

test('splitParts yields full 1 MiB parts and pads the last one', () => {
  const parts = splitParts(new Uint8Array(CHUNK + 5), 'x', '.img')
  expect(parts.map((p) => p.name)).toEqual(['x-0-1048576.img', 'x-1048576-2097152.img'])
  expect(parts[1].bytes.length).toBe(CHUNK)
  expect(parts[1].bytes[4]).toBe(0)
})

test('padTo extends the data with zeros before splitting', () => {
  const parts = splitParts(new Uint8Array(10), 'a', '.iso', 2 * CHUNK)
  expect(parts.length).toBe(2)
  expect(parts[1].bytes.every((b) => b === 0)).toBe(true)
})
