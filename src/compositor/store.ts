import { create } from 'zustand'
import { dwindle, type Gaps, type Rect } from './layout/dwindle'

export interface WinState {
  id: string
  appId: string
  title: string
  workspace: number
  floating: boolean
  floatRect?: Rect
  fullscreen: boolean
}

export const WORKSPACES = 10

export interface WmState {
  windows: Record<string, WinState>
  /** Tiling order per workspace (floating windows are not in it). */
  order: Record<number, string[]>
  active: number
  focused: string | null
  area: Rect
  gaps: Gaps
  open(appId: string, title: string): string
  close(id: string): void
  killActive(): void
  focus(id: string): void
  setTitle(id: string, title: string): void
  switchWorkspace(n: number): void
  moveToWorkspace(id: string, n: number): void
  toggleFloating(id: string): void
  setFloatRect(id: string, r: Rect): void
  toggleFullscreen(id: string): void
  setArea(r: Rect): void
  setGaps(g: Gaps): void
  /** Rects of the windows on the active workspace. */
  layout(): Record<string, Rect>
}

const validWs = (n: number) => Number.isInteger(n) && n >= 1 && n <= WORKSPACES

function centered(area: Rect): Rect {
  const w = Math.round(area.w * 0.6)
  const h = Math.round(area.h * 0.6)
  return { x: area.x + Math.round((area.w - w) / 2), y: area.y + Math.round((area.h - h) / 2), w, h }
}

export function createWmStore() {
  return create<WmState>()((set, get) => {
    const onWorkspace = (ws: number) => Object.values(get().windows).filter((w) => w.workspace === ws)

    /** Window to focus after `gone` leaves workspace `ws`. */
    const nextFocus = (ws: number, gone: string): string | null => {
      const order = get().order[ws] ?? []
      const i = order.indexOf(gone)
      const rest = order.filter((id) => id !== gone)
      if (rest.length) return rest[Math.max(0, i - 1)] ?? rest[0]
      return onWorkspace(ws).find((w) => w.id !== gone)?.id ?? null
    }

    return {
      windows: {},
      order: {},
      active: 1,
      focused: null,
      area: { x: 0, y: 0, w: 1280, h: 720 },
      gaps: { inner: 10, outer: 20 },

      open(appId, title) {
        const id = crypto.randomUUID()
        const ws = get().active
        set((s) => ({
          windows: { ...s.windows, [id]: { id, appId, title, workspace: ws, floating: false, fullscreen: false } },
          order: { ...s.order, [ws]: [...(s.order[ws] ?? []), id] },
          focused: id,
        }))
        return id
      },

      close(id) {
        const w = get().windows[id]
        if (!w) return
        const focus = get().focused === id ? nextFocus(w.workspace, id) : get().focused
        set((s) => {
          const windows = { ...s.windows }
          delete windows[id]
          return {
            windows,
            order: { ...s.order, [w.workspace]: (s.order[w.workspace] ?? []).filter((x) => x !== id) },
            focused: focus,
          }
        })
      },

      killActive() {
        const f = get().focused
        if (f) get().close(f)
      },

      focus(id) {
        if (get().windows[id]) set({ focused: id })
      },

      setTitle(id, title) {
        const w = get().windows[id]
        if (w && w.title !== title) set((s) => ({ windows: { ...s.windows, [id]: { ...w, title } } }))
      },

      switchWorkspace(n) {
        if (!validWs(n) || n === get().active) return
        const order = get().order[n] ?? []
        set({ active: n, focused: order[order.length - 1] ?? onWorkspace(n)[0]?.id ?? null })
      },

      moveToWorkspace(id, n) {
        const w = get().windows[id]
        if (!w || !validWs(n) || w.workspace === n) return
        const focus = get().focused === id ? nextFocus(w.workspace, id) : get().focused
        set((s) => ({
          windows: { ...s.windows, [id]: { ...w, workspace: n } },
          order: {
            ...s.order,
            [w.workspace]: (s.order[w.workspace] ?? []).filter((x) => x !== id),
            ...(w.floating ? {} : { [n]: [...(s.order[n] ?? []), id] }),
          },
          focused: focus,
        }))
      },

      toggleFloating(id) {
        const w = get().windows[id]
        if (!w) return
        const floating = !w.floating
        set((s) => ({
          windows: { ...s.windows, [id]: { ...w, floating, floatRect: w.floatRect ?? centered(s.area) } },
          order: {
            ...s.order,
            [w.workspace]: floating
              ? (s.order[w.workspace] ?? []).filter((x) => x !== id)
              : [...(s.order[w.workspace] ?? []), id],
          },
        }))
      },

      setFloatRect(id, r) {
        const w = get().windows[id]
        if (w) set((s) => ({ windows: { ...s.windows, [id]: { ...w, floatRect: r } } }))
      },

      toggleFullscreen(id) {
        const w = get().windows[id]
        if (w) set((s) => ({ windows: { ...s.windows, [id]: { ...w, fullscreen: !w.fullscreen } } }))
      },

      setArea(area) {
        set({ area })
      },

      setGaps(gaps) {
        set({ gaps })
      },

      layout() {
        const { active, order, area, gaps } = get()
        const out = dwindle(order[active] ?? [], area, gaps)
        for (const w of onWorkspace(active)) {
          if (w.floating) out[w.id] = w.floatRect ?? centered(area)
          if (w.fullscreen) out[w.id] = area
        }
        return out
      },
    }
  })
}

export type WmStore = ReturnType<typeof createWmStore>
