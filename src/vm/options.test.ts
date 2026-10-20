import { expect, test } from 'vitest'
import { buildV86Options } from './options'
import { CHUNK } from './parts'

const manifest = {
  buildId: 'b1',
  cdrom: { base: 'alpine', ext: '.iso', size: 64 * 1024 * 1024 },
  hda: { base: 'rice', ext: '.img', size: 128 * CHUNK },
  packages: [],
}

test('disks are async parts with fixed 1 MiB chunks and no network device', () => {
  const o = buildV86Options({ baseUrl: '/vm/', manifest, wasmPath: '/vm/runtime/v86.wasm' }) as any
  expect(o.cdrom).toEqual({ url: '/vm/alpine.iso', async: true, size: 64 * 1024 * 1024, use_parts: true, fixed_chunk_size: CHUNK })
  expect(o.hda).toMatchObject({ async: true, use_parts: true, fixed_chunk_size: CHUNK, size: 128 * CHUNK })
  expect(o.net_device).toBeUndefined()
  expect(o.memory_size).toBe(256 * 1024 * 1024)
  expect(o.autostart).toBe(true)
})

test('autostart can be turned off so the overlay is restored before the emulator runs', () => {
  const o = buildV86Options({ baseUrl: '/vm/', manifest, wasmPath: '/vm/runtime/v86.wasm', autostart: false })
  expect(o.autostart).toBe(false)
})
