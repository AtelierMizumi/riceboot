export interface OverlayStore {
  readonly persistent: boolean
  storedBuildId(): Promise<string | null>
  load(): Promise<Map<number, Uint8Array>>
  save(buildId: string, blocks: Map<number, Uint8Array>): Promise<void>
  clear(): Promise<void>
}

const STORE = 'blocks'
const BUILD_KEY = 'meta:buildId'
const blockKey = (i: number) => `block:${i}`

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    run(t.objectStore(STORE))
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

function idbStore(db: IDBDatabase): OverlayStore {
  return {
    persistent: true,
    async storedBuildId() {
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(BUILD_KEY)
        req.onsuccess = () => resolve((req.result as string | undefined) ?? null)
        req.onerror = () => reject(req.error)
      })
    },
    async load() {
      const out = new Map<number, Uint8Array>()
      await new Promise<void>((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).openCursor()
        req.onsuccess = () => {
          const c = req.result
          if (!c) return resolve()
          const key = String(c.key)
          if (key.startsWith('block:')) out.set(Number(key.slice(6)), c.value as Uint8Array)
          c.continue()
        }
        req.onerror = () => reject(req.error)
      })
      return out
    },
    async save(buildId, blocks) {
      await tx(db, 'readwrite', (s) => {
        s.put(buildId, BUILD_KEY)
        for (const [i, bytes] of blocks) s.put(bytes, blockKey(i))
      })
    },
    async clear() {
      await tx(db, 'readwrite', (s) => s.clear())
    },
  }
}

function memoryStore(): OverlayStore {
  let buildId: string | null = null
  const blocks = new Map<number, Uint8Array>()
  return {
    persistent: false,
    async storedBuildId() {
      return buildId
    },
    async load() {
      return new Map(blocks)
    },
    async save(id, b) {
      buildId = id
      for (const [i, bytes] of b) blocks.set(i, bytes)
    },
    async clear() {
      buildId = null
      blocks.clear()
    },
  }
}

/** Opens the overlay database, or falls back to memory when storage is blocked (private window, policy). */
export async function openOverlayStore(dbName = 'riceboot-vm'): Promise<OverlayStore> {
  try {
    return idbStore(await openDb(dbName))
  } catch {
    return memoryStore()
  }
}
