import { Tree } from './tree'
import type { Vfs } from './types'

/** Volatile Vfs: lives only as long as the page. */
export function createMemoryVfs(): Vfs {
  const tree = new Tree()
  return {
    persistent: false,
    readFile: async (p) => tree.readFile(p),
    writeFile: async (p, d) => void tree.writeFile(p, d),
    mkdir: async (p, o) => void tree.mkdir(p, o?.recursive),
    readdir: async (p) => tree.readdir(p),
    stat: async (p) => tree.stat(p),
    exists: async (p) => tree.exists(p),
    rm: async (p, o) => void tree.rm(p, o?.recursive),
    watch: (prefix, cb) => tree.watch(prefix, cb),
    reset: async () => tree.clear(),
  }
}
