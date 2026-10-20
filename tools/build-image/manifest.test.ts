import { expect, test } from 'vitest'
import { CHUNK } from '../../src/vm/parts'
import { buildManifest, listParts, totalBytes } from './manifest.ts'

const cdrom = { base: 'alpine', ext: '.iso', size: 4 * CHUNK }
const hda = { base: 'rice', ext: '.img', size: 128 * CHUNK }

test('manifest lists every part and totals match', () => {
  const m = buildManifest({ buildId: 'b1', cdrom, hda, packages: ['fastfetch'] })
  expect(listParts(m.hda)).toHaveLength(128)
  expect(listParts(m.cdrom)).toHaveLength(4)
  expect(listParts(m.hda)[0]).toBe('rice-0-1048576.img')
  expect(totalBytes(m)).toBe((4 + 128) * CHUNK)
})

test('a disk size that is not a multiple of CHUNK is rejected', () => {
  expect(() => buildManifest({ buildId: 'b', cdrom, hda: { base: 'rice', ext: '.img', size: CHUNK + 1 }, packages: [] })).toThrow(/multiple/)
})
