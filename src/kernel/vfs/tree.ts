import { dirname, normalize } from './path'
import { VfsError, type NodeType, type Stat, type WatchEvent } from './types'

export interface Node {
  path: string
  type: NodeType
  data?: string
  mtime: number
}

/** Change the tree made; adapters persist these. */
export type Mutation = { put: Node } | { del: string }

const encoder = new TextEncoder()

/**
 * In-memory filesystem tree with POSIX-like semantics. Shared by every Vfs
 * adapter: memory uses it directly, IndexedDB uses it as a cache and persists
 * the mutations it returns.
 */
export class Tree {
  private nodes = new Map<string, Node>()
  private watchers = new Set<{ prefix: string; cb: (e: WatchEvent) => void }>()

  constructor(nodes: Iterable<Node> = []) {
    for (const n of nodes) this.nodes.set(n.path, n)
    if (!this.nodes.has('/')) this.nodes.set('/', { path: '/', type: 'dir', mtime: Date.now() })
  }

  private get(p: string): Node {
    const n = this.nodes.get(p)
    if (!n) throw new VfsError('ENOENT', p)
    return n
  }

  private children(p: string): string[] {
    const prefix = p === '/' ? '/' : p + '/'
    const out: string[] = []
    for (const key of this.nodes.keys()) {
      if (key !== p && key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
        out.push(key.slice(prefix.length))
      }
    }
    return out.sort()
  }

  private emit(e: WatchEvent) {
    for (const w of this.watchers) {
      if (e.path === w.prefix || e.path.startsWith(w.prefix === '/' ? '/' : w.prefix + '/')) w.cb(e)
    }
  }

  readFile(raw: string): string {
    const p = normalize(raw)
    const n = this.get(p)
    if (n.type === 'dir') throw new VfsError('EISDIR', p)
    return n.data ?? ''
  }

  writeFile(raw: string, data: string): Mutation[] {
    const p = normalize(raw)
    const parent = this.nodes.get(dirname(p))
    if (!parent) throw new VfsError('ENOENT', p)
    if (parent.type !== 'dir') throw new VfsError('ENOTDIR', p)
    if (this.nodes.get(p)?.type === 'dir') throw new VfsError('EISDIR', p)
    const node: Node = { path: p, type: 'file', data, mtime: Date.now() }
    this.nodes.set(p, node)
    this.emit({ type: 'write', path: p })
    return [{ put: node }]
  }

  mkdir(raw: string, recursive = false): Mutation[] {
    const p = normalize(raw)
    const existing = this.nodes.get(p)
    if (existing) {
      if (recursive && existing.type === 'dir') return []
      throw new VfsError('EEXIST', p)
    }
    const parent = this.nodes.get(dirname(p))
    const out: Mutation[] = []
    if (!parent) {
      if (!recursive) throw new VfsError('ENOENT', p)
      out.push(...this.mkdir(dirname(p), true))
    } else if (parent.type !== 'dir') {
      throw new VfsError('ENOTDIR', p)
    }
    const node: Node = { path: p, type: 'dir', mtime: Date.now() }
    this.nodes.set(p, node)
    this.emit({ type: 'mkdir', path: p })
    return [...out, { put: node }]
  }

  readdir(raw: string): string[] {
    const p = normalize(raw)
    if (this.get(p).type !== 'dir') throw new VfsError('ENOTDIR', p)
    return this.children(p)
  }

  stat(raw: string): Stat {
    const n = this.get(normalize(raw))
    return { type: n.type, size: n.data ? encoder.encode(n.data).length : 0, mtime: n.mtime }
  }

  exists(raw: string): boolean {
    return this.nodes.has(normalize(raw))
  }

  rm(raw: string, recursive = false): Mutation[] {
    const p = normalize(raw)
    const n = this.get(p)
    if (n.type === 'dir') {
      const kids = this.children(p)
      if (kids.length && !recursive) throw new VfsError('ENOTEMPTY', p)
      for (const k of kids) this.rm(p === '/' ? '/' + k : p + '/' + k, true)
    }
    const out: Mutation[] = []
    for (const key of [...this.nodes.keys()]) {
      if (key === p || key.startsWith(p + '/')) {
        this.nodes.delete(key)
        out.push({ del: key })
      }
    }
    this.emit({ type: 'delete', path: p })
    return out
  }

  watch(prefix: string, cb: (e: WatchEvent) => void): () => void {
    const w = { prefix: normalize(prefix), cb }
    this.watchers.add(w)
    return () => this.watchers.delete(w)
  }

  clear() {
    this.nodes.clear()
    this.nodes.set('/', { path: '/', type: 'dir', mtime: Date.now() })
  }
}
