import { expect, test } from 'vitest'
import { BlockOverlay, DISK_UNIT } from './overlay'

const block = (v: number) => new Uint8Array(DISK_UNIT).fill(v)

test('stores and returns a block by index, sorted dirty list', () => {
  const o = new BlockOverlay()
  o.put(7, block(1))
  o.put(2, block(2))
  expect(o.get(7)?.[0]).toBe(1)
  expect(o.dirty()).toEqual([2, 7])
  expect(o.size).toBe(2)
})

test('rejects a block that is not exactly DISK_UNIT bytes', () => {
  expect(() => new BlockOverlay().put(0, new Uint8Array(10))).toThrow(/DISK_UNIT/)
})

test('takeDirty returns the dirty blocks and clears their dirty flag but keeps the data', () => {
  const o = new BlockOverlay()
  o.put(3, block(9))
  const taken = o.takeDirty()
  expect([...taken.keys()]).toEqual([3])
  expect(o.dirty()).toEqual([])
  expect(o.get(3)?.[0]).toBe(9)
})

test('clear removes everything', () => {
  const o = new BlockOverlay()
  o.put(1, block(1))
  o.clear()
  expect(o.size).toBe(0)
  expect(o.get(1)).toBeUndefined()
})
