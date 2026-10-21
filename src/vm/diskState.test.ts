import { expect, test, vi } from 'vitest'
import { BlockOverlay } from './overlay'
import { captureDirty, hdaFromEmulator, restoreBlocks, type V86DiskLike } from './diskState'

const block = (v: number) => new Uint8Array(256).fill(v)

test('captureDirty copies only the blocks the guest wrote into the overlay', () => {
  const disk: V86DiskLike = { get_state: () => [[[5, block(3)]]], set_state: vi.fn() }
  const overlay = new BlockOverlay()
  captureDirty(disk, overlay)
  expect(overlay.dirty()).toEqual([5])
  expect(overlay.get(5)?.[0]).toBe(3)
})

test('restoreBlocks hands the blocks back through set_state', () => {
  const set = vi.fn()
  restoreBlocks({ get_state: () => null, set_state: set }, new Map([[9, block(4)]]))
  expect(set).toHaveBeenCalledTimes(1)
  expect(set.mock.calls[0][0][0][0][0]).toBe(9)
})

test('hdaFromEmulator reaches the package disk through the v86 internals', () => {
  const hda = { get_state: () => [[]], set_state: vi.fn() }
  const emu = { v86: { cpu: { devices: { ide: { primary: { master: { buffer: hda } } } } } } }
  expect(hdaFromEmulator(emu)).toBe(hda)
  expect(hdaFromEmulator({})).toBeNull()
})

test('captureDirty ignores blocks whose bytes did not change since the last capture', () => {
  const overlay = new BlockOverlay()
  const disk: V86DiskLike = { get_state: () => [[[5, block(3)]]], set_state: vi.fn() }
  captureDirty(disk, overlay)
  overlay.takeDirty()
  captureDirty(disk, overlay)
  expect(overlay.dirty()).toEqual([])
})

test('captureDirty copies the bytes so later writes by v86 do not change the overlay', () => {
  const overlay = new BlockOverlay()
  const live = block(3)
  captureDirty({ get_state: () => [[[5, live]]], set_state: vi.fn() }, overlay)
  live.fill(9)
  expect(overlay.get(5)?.[0]).toBe(3)
})
