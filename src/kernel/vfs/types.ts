export type NodeType = 'file' | 'dir'

export interface Stat {
  type: NodeType
  size: number
  mtime: number
}

export type VfsErrorCode = 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'ENOTEMPTY'

export class VfsError extends Error {
  readonly code: VfsErrorCode
  readonly path: string
  constructor(code: VfsErrorCode, path: string) {
    super(`${code}: ${path}`)
    this.code = code
    this.path = path
  }
}

export type WatchEvent = { type: 'write' | 'delete' | 'mkdir'; path: string }

export interface Vfs {
  readFile(p: string): Promise<string>
  /** Parent directory must exist. */
  writeFile(p: string, data: string): Promise<void>
  mkdir(p: string, opts?: { recursive?: boolean }): Promise<void>
  /** Entry names, sorted. */
  readdir(p: string): Promise<string[]>
  stat(p: string): Promise<Stat>
  exists(p: string): Promise<boolean>
  rm(p: string, opts?: { recursive?: boolean }): Promise<void>
  /** Subscribe to changes at or under `prefix`. Returns an unsubscribe function. */
  watch(prefix: string, cb: (e: WatchEvent) => void): () => void
  /** Wipe everything except "/". */
  reset(): Promise<void>
  readonly persistent: boolean
}
