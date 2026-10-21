import { BlockOverlay } from './overlay'

/** The part of a v86 disk (`emu.v86.cpu.devices.ide.primary.master.buffer`) this module uses. */
export interface V86DiskLike {
  get_state(): unknown
  set_state(state: unknown): void
}

/** Copies every block v86 reports as written into the overlay. The format is pinned in docs/research/m3b-disk-state.md.
 *  v86 reports all blocks written since attach, so a block is copied (and marked dirty) only when its bytes changed. */
export function captureDirty(disk: V86DiskLike, overlay: BlockOverlay): void {
  const state = disk.get_state() as [Array<[number, Uint8Array]>] | null
  const entries = state?.[0] ?? []
  for (const [key, bytes] of entries) {
    const known = overlay.get(key)
    if (known && sameBytes(known, bytes)) continue
    // Copy: v86 may reuse the buffer it handed us.
    overlay.put(key, bytes.slice())
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Hands saved blocks back to v86. Call before the emulator runs. */
export function restoreBlocks(disk: V86DiskLike, blocks: Map<number, Uint8Array>): void {
  disk.set_state([[...blocks.entries()]])
}

/** The package disk (hda) inside a v86 emulator, or null when the internals are not there. */
export function hdaFromEmulator(emu: unknown): V86DiskLike | null {
  const e = emu as { v86?: { cpu?: { devices?: { ide?: { primary?: { master?: { buffer?: V86DiskLike } } } } } } }
  return e.v86?.cpu?.devices?.ide?.primary?.master?.buffer ?? null
}
