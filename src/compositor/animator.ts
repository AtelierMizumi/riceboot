import type { Rect } from './layout/dwindle'

export interface AnimateOptions {
  durationMs: number
  ease: (t: number) => number
  opacity?: [number, number]
}

export interface Animator {
  /** Tween `el` from `from` to `to`, writing styles directly (no React). Resolves when done or cancelled. */
  animate(el: HTMLElement, from: Rect, to: Rect, opts: AnimateOptions): Promise<void>
  cancel(el: HTMLElement): void
}

export function applyRect(el: HTMLElement, r: Rect) {
  el.style.transform = `translate(${r.x}px, ${r.y}px)`
  el.style.width = `${r.w}px`
  el.style.height = `${r.h}px`
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const round = (n: number) => Math.round(n * 100) / 100

export function createAnimator(
  raf: (cb: FrameRequestCallback) => number = requestAnimationFrame,
  now: () => number = () => performance.now(),
): Animator {
  const active = new Map<HTMLElement, () => void>()

  const cancel = (el: HTMLElement) => {
    active.get(el)?.()
  }

  const animate: Animator['animate'] = (el, from, to, { durationMs, ease, opacity }) => {
    cancel(el)
    return new Promise<void>((resolve) => {
      const start = now()
      let stopped = false
      const finish = () => {
        stopped = true
        active.delete(el)
        el.style.willChange = ''
        resolve()
      }
      active.set(el, finish)
      el.style.willChange = 'transform'
      const frame = () => {
        if (stopped) return
        const t = durationMs <= 0 ? 1 : Math.min(1, (now() - start) / durationMs)
        const k = ease(t)
        applyRect(el, {
          x: round(lerp(from.x, to.x, k)),
          y: round(lerp(from.y, to.y, k)),
          w: round(lerp(from.w, to.w, k)),
          h: round(lerp(from.h, to.h, k)),
        })
        if (opacity) el.style.opacity = String(round(lerp(opacity[0], opacity[1], k)))
        if (t >= 1) finish()
        else raf(frame)
      }
      raf(frame)
    })
  }

  return { animate, cancel }
}
