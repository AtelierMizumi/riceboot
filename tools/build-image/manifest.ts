import { CHUNK, partName } from '../../src/vm/parts.ts'
import type { VmDisk, VmManifest } from '../../src/vm/options.ts'

export function buildManifest(args: VmManifest): VmManifest {
  for (const d of [args.cdrom, args.hda]) {
    if (d.size % CHUNK !== 0) throw new Error(`disk size must be a multiple of CHUNK: ${d.base}`)
  }
  return { buildId: args.buildId, cdrom: args.cdrom, hda: args.hda, packages: [...args.packages] }
}

/** File names of every part of `d`, in offset order. */
export function listParts(d: VmDisk): string[] {
  const names: string[] = []
  for (let off = 0; off < d.size; off += CHUNK) names.push(partName(d.base, d.ext, off))
  return names
}

/** Bytes across all disk parts. Runtime files are added by the build script. */
export function totalBytes(m: VmManifest): number {
  return m.cdrom.size + m.hda.size
}
