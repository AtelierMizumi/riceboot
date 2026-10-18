import { lazy, Suspense, useEffect, useRef, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react'
import { APPS, type AppCtx } from '../apps/registry'
import type { Vfs } from '../kernel/vfs'
import type { ThemePack } from '../themes'
import { applyRect, type Animator } from './animator'
import { useWmStore } from './context'
import { ErrorBoundary } from './ErrorBoundary'
import type { Rect } from './layout/dwindle'
import type { WinState } from './store'

const APP_COMPONENTS: Record<string, ComponentType<AppCtx>> = Object.fromEntries(
  Object.values(APPS).map((a) => [a.id, lazy(a.load)]),
)

const same = (a?: Rect, b?: Rect) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
const MIN = 120

interface Props {
  win: WinState
  vfs: Vfs
  theme: ThemePack
  animator: Animator
}

/**
 * A window frame. Geometry, visibility and focus are written straight to the
 * DOM from a store subscription, so layout changes never re-render React.
 */
export default function Window({ win, vfs, theme, animator }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const store = useWmStore()
  const { id, appId } = win

  useEffect(() => {
    const node = el.current
    if (!node) return
    const { curves } = theme
    let current: Rect | undefined

    const sync = (first: boolean) => {
      const s = store.getState()
      const w = s.windows[id]
      if (!w) return
      node.classList.toggle('focused', s.focused === id)
      const visible = w.workspace === s.active
      node.style.visibility = visible ? '' : 'hidden'
      if (!visible) return
      const target = s.layout()[id]
      if (!target || same(target, current)) return
      if (first) {
        const from = { x: target.x + target.w * 0.05, y: target.y + target.h * 0.05, w: target.w * 0.9, h: target.h * 0.9 }
        void animator.animate(node, from, target, { durationMs: curves.durationMs, ease: curves.windowIn, opacity: [0, 1] })
      } else {
        void animator.animate(node, current ?? target, target, { durationMs: curves.durationMs, ease: curves.windowIn })
      }
      current = target
    }

    sync(true)
    const unsub = store.subscribe(() => sync(false))
    return () => {
      unsub()
      animator.cancel(node)
    }
  }, [id, store, theme, animator])

  /** Alt+drag moves a floating window; the corner handle resizes it. Commits to the store on release. */
  const onPointerDown = (e: ReactPointerEvent) => {
    store.getState().focus(id)
    const mode = (e.target as HTMLElement).classList.contains('win-resize') ? 'resize' : 'move'
    const s = store.getState()
    const w = s.windows[id]
    const start = s.layout()[id]
    if (!w?.floating || !start || e.button !== 0) return
    if (mode === 'move' && !e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    const node = el.current!
    animator.cancel(node)
    const ox = e.clientX
    const oy = e.clientY
    let rect = start
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - ox
      const dy = ev.clientY - oy
      rect =
        mode === 'move'
          ? { ...start, x: start.x + dx, y: start.y + dy }
          : { ...start, w: Math.max(MIN, start.w + dx), h: Math.max(MIN, start.h + dy) }
      applyRect(node, rect)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      store.getState().setFloatRect(id, rect)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const App = APP_COMPONENTS[appId]
  const ctx: AppCtx = {
    vfs,
    windowId: id,
    tokens: theme.tokens,
    setTitle: (t) => store.getState().setTitle(id, t),
    wm: () => store.getState(),
  }

  return (
    <div
      ref={el}
      className="win"
      data-testid={`window-${appId}`}
      role="group"
      aria-label={win.title}
      onPointerDownCapture={onPointerDown}
    >
      <ErrorBoundary>
        <Suspense fallback={<div className="win-loading">loading {appId}…</div>}>
          <App {...ctx} />
        </Suspense>
      </ErrorBoundary>
      {win.floating && <div className="win-resize" aria-hidden="true" />}
    </div>
  )
}
