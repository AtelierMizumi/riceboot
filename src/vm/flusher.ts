export interface Flusher {
  /** (Re)starts the debounce timer. */
  schedule(): void
  /** True while a save is waiting on the debounce timer. */
  isScheduled(): boolean
  /** Saves now if a save was scheduled. */
  flushNow(): Promise<void>
  /** Cancels the timer; no further saves happen. */
  dispose(): void
}

export function createFlusher(opts: {
  save(): Promise<void>
  onError(e: unknown): void
  delayMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}): Flusher {
  const delay = opts.delayMs ?? 2000
  const setT = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearT = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>))
  let timer: unknown = null
  let pending = false
  let disposed = false

  const flushNow = async () => {
    if (timer !== null) clearT(timer)
    timer = null
    if (!pending || disposed) return
    pending = false
    try {
      await opts.save()
    } catch (e) {
      pending = true // keep the dirty state so the next flush retries
      opts.onError(e)
    }
  }

  return {
    schedule() {
      if (disposed) return
      pending = true
      if (timer !== null) clearT(timer)
      timer = setT(() => void flushNow(), delay)
    },
    isScheduled() {
      return timer !== null
    },
    flushNow,
    dispose() {
      disposed = true
      if (timer !== null) clearT(timer)
      timer = null
    },
  }
}
