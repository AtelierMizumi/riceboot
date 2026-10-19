/** True when the browser can run WebAssembly, which v86 needs. */
export function isVmSupported(g: { WebAssembly?: unknown } = globalThis as { WebAssembly?: unknown }): boolean {
  return typeof g.WebAssembly === 'object' && g.WebAssembly !== null
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
