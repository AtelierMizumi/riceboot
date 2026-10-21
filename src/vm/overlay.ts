/** v86's native block unit for the disk cache (see docs/research/m3b-disk-state.md). */
export const DISK_UNIT = 256

/** Blocks the guest has written, keyed by v86's block index. Dirty blocks are those not yet saved. */
export class BlockOverlay {
  private data = new Map<number, Uint8Array>()
  private dirtySet = new Set<number>()

  put(index: number, bytes: Uint8Array): void {
    if (bytes.length !== DISK_UNIT) throw new Error(`block must be exactly DISK_UNIT bytes, got ${bytes.length}`)
    this.data.set(index, bytes)
    this.dirtySet.add(index)
  }

  get(index: number): Uint8Array | undefined {
    return this.data.get(index)
  }

  dirty(): number[] {
    return [...this.dirtySet].sort((a, b) => a - b)
  }

  /** Returns the dirty blocks and marks them clean. The data stays in the overlay. */
  takeDirty(): Map<number, Uint8Array> {
    const out = new Map<number, Uint8Array>()
    for (const i of this.dirty()) out.set(i, this.data.get(i)!)
    this.dirtySet.clear()
    return out
  }

  /** Makes blocks dirty again, e.g. after a save failed. Keys without data are ignored. */
  markDirty(indexes: Iterable<number>): void {
    for (const i of indexes) if (this.data.has(i)) this.dirtySet.add(i)
  }

  clear(): void {
    this.data.clear()
    this.dirtySet.clear()
  }

  get size(): number {
    return this.data.size
  }
}
