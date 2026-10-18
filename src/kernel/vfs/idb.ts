import { openDB, type IDBPDatabase } from 'idb'
import { Tree, type Mutation, type Node } from './tree'
import type { Vfs } from './types'

const STORE = 'nodes'

/** Vfs persisted in IndexedDB. The whole tree is cached in memory on open. */
export async function createIdbVfs(dbName = 'riceboot-vfs'): Promise<Vfs> {
  const db = await openDB(dbName, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'path' })
    },
  })
  const tree = new Tree((await db.getAll(STORE)) as Node[])

  const persist = async (muts: Mutation[]) => {
    if (!muts.length) return
    const tx = db.transaction(STORE, 'readwrite')
    for (const m of muts) {
      if ('put' in m) void tx.store.put(m.put)
      else void tx.store.delete(m.del)
    }
    await tx.done
  }

  return {
    persistent: true,
    readFile: async (p) => tree.readFile(p),
    writeFile: async (p, d) => persist(tree.writeFile(p, d)),
    mkdir: async (p, o) => persist(tree.mkdir(p, o?.recursive)),
    readdir: async (p) => tree.readdir(p),
    stat: async (p) => tree.stat(p),
    exists: async (p) => tree.exists(p),
    rm: async (p, o) => persist(tree.rm(p, o?.recursive)),
    watch: (prefix, cb) => tree.watch(prefix, cb),
    reset: () => resetDb(db, tree),
  }
}

async function resetDb(db: IDBPDatabase, tree: Tree) {
  tree.clear()
  await db.clear(STORE)
}
