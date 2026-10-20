import { canAllocateMemory } from './guards'

/** VM guest memory in bytes; v86 is started with this much. */
export const VM_MEMORY_BYTES = 256 * 1024 * 1024

/** True when the browser runs WebAssembly and can reserve the VM's memory. */
export function isVmSupported(g: { WebAssembly?: unknown } = globalThis as { WebAssembly?: unknown }): boolean {
  const wa = g.WebAssembly as { Memory?: unknown } | undefined
  if (typeof wa !== 'object' || wa === null) return false
  return canAllocateMemory(VM_MEMORY_BYTES, wa)
}

/** Inject a classic script (libv86.js exposes a global `V86`) and resolve when it has loaded. */
export function loadRuntime(src: string, doc: Document = document): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = doc.createElement('script')
    el.src = src
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`failed to load ${src}`))
    doc.head.appendChild(el)
  })
}
