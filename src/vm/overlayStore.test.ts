import { afterEach, expect, test, vi } from 'vitest'
import { openOverlayStore } from './overlayStore'

const block = (v: number) => new Uint8Array(256).fill(v)

test('saves blocks with their build id and loads them back', async () => {
  const s = await openOverlayStore('t-roundtrip')
  expect(s.persistent).toBe(true)
  await s.save('b1', new Map([[4, block(7)]]))
  expect(await s.storedBuildId()).toBe('b1')
  const loaded = await s.load()
  expect(loaded.get(4)?.[0]).toBe(7)
})

test('clear removes the blocks and the build id', async () => {
  const s = await openOverlayStore('t-clear')
  await s.save('b1', new Map([[1, block(1)]]))
  await s.clear()
  expect(await s.storedBuildId()).toBeNull()
  expect((await s.load()).size).toBe(0)
})

afterEach(() => vi.restoreAllMocks())

test('falls back to memory and reports it when IndexedDB cannot open', async () => {
  vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError')
  })
  const s = await openOverlayStore('t-blocked')
  expect(s.persistent).toBe(false)
  await s.save('b1', new Map([[2, block(5)]]))
  expect((await s.load()).get(2)?.[0]).toBe(5)
})
