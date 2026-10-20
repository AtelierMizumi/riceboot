/** Every disk and ISO part is exactly this size (v86 fixed_chunk_size). */
export const CHUNK = 1048576

/** File name of the part starting at byte `offset`, in the v86 `use_parts` scheme. */
export function partName(base: string, ext: string, offset: number): string {
  return `${base}-${offset}-${offset + CHUNK}${ext}`
}

/** Split `data` into full CHUNK-sized parts, zero-padding to `padTo` bytes first. */
export function splitParts(data: Uint8Array, base: string, ext: string, padTo = 0): { name: string; bytes: Uint8Array }[] {
  const total = Math.ceil(Math.max(data.length, padTo) / CHUNK) * CHUNK
  const buf = new Uint8Array(total)
  buf.set(data)
  const parts: { name: string; bytes: Uint8Array }[] = []
  for (let off = 0; off < total; off += CHUNK) {
    parts.push({ name: partName(base, ext, off), bytes: buf.subarray(off, off + CHUNK) })
  }
  return parts
}
