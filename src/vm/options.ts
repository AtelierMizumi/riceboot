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
