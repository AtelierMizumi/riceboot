import { CHUNK } from './parts'

/** One lazily loaded disk: parts are `<base><offset>-<end><ext>`, `size` is bytes (multiple of CHUNK). */
export interface VmDisk {
  base: string
  ext: string
  size: number
}

/** What the app needs to know about a built image; written to public/vm/manifest.json. */
export interface VmManifest {
  buildId: string
  cdrom: VmDisk
  hda: VmDisk
  packages: string[]
}

/** Options passed to `new V86(...)`. Only the fields riceboot sets. */
export interface V86Options {
  wasm_path: string
  bios: { url: string }
  vga_bios: { url: string }
  cdrom: { url: string; async: true; size: number; use_parts: true; fixed_chunk_size: number }
  hda: { url: string; async: true; size: number; use_parts: true; fixed_chunk_size: number }
  memory_size: number
  autostart: boolean
}

/** v86 options for the read-only disks. No network device: the guest is offline by design. */
export function buildV86Options(args: {
  baseUrl: string
  manifest: VmManifest
  wasmPath: string
  memoryMiB?: number
  autostart?: boolean
}): V86Options {
  const { baseUrl, manifest } = args
  const disk = (d: VmDisk) => ({
    url: `${baseUrl}${d.base}${d.ext}`,
    async: true as const,
    size: d.size,
    use_parts: true as const,
    fixed_chunk_size: CHUNK,
  })
  return {
    wasm_path: args.wasmPath,
    bios: { url: `${baseUrl}runtime/seabios.bin` },
    vga_bios: { url: `${baseUrl}runtime/vgabios.bin` },
    cdrom: disk(manifest.cdrom),
    hda: disk(manifest.hda),
    memory_size: (args.memoryMiB ?? 256) * 1024 * 1024,
    autostart: args.autostart ?? true,
  }
}
