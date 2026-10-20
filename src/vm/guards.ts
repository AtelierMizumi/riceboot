import type { VmManifest } from './options'

/**
 * Run guard: each start gets a new id; only the newest id is current. cancelAll() retires every outstanding
 * run, so callbacks and awaits from an old start cannot touch a newer mode or terminal.
 */
export function createRunGuard() {
  let latest = 0
  let live = 0
  return {
    next(): number {
      live = ++latest
      return live
    },
    isCurrent(id: number): boolean {
      return id === live
    },
    cancelAll(): void {
      live = 0
    },
  }
}

/** Calls onTimeout once after ms unless clear() is called first. */
export function startWatchdog(ms: number, onTimeout: () => void): { clear(): void } {
  const t = setTimeout(onTimeout, ms)
  return { clear: () => clearTimeout(t) }
}

/** True when `bytes` of WebAssembly memory can be reserved. Catches low-memory devices before v86 does. */
export function canAllocateMemory(bytes: number, wa: { Memory?: unknown } = WebAssembly): boolean {
  try {
    new (wa.Memory as new (d: { initial: number }) => unknown)({ initial: Math.ceil(bytes / 65536) })
    return true
  } catch {
    return false
  }
}

/** Fetch the build manifest, failing loudly on an HTTP error (a SPA fallback page is not a manifest). */
export async function fetchManifest(url: string, fetchFn: typeof fetch = fetch): Promise<VmManifest> {
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`)
  return (await res.json()) as VmManifest
}
