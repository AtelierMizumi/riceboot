import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const root = join(import.meta.dirname, '../../public/vm')

test('build output exists and the manifest matches the files on disk', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  for (const d of [m.cdrom, m.hda]) {
    for (let o = 0; o < d.size; o += 1048576) {
      expect(existsSync(join(root, `${d.base}-${o}-${o + 1048576}${d.ext}`))).toBe(true)
    }
  }
  expect(existsSync(join(root, 'runtime/libv86.js'))).toBe(true)
  expect(existsSync(join(root, 'runtime/v86.wasm'))).toBe(true)
})
