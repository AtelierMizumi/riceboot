import type { ComponentType } from 'react'
import type { WmState } from '../compositor/store'
import type { Vfs } from '../kernel/vfs'
import type { ThemeTokens } from '../themes'

export interface AppCtx {
  vfs: Vfs
  windowId: string
  tokens: ThemeTokens
  setTitle(t: string): void
  /** Read-only snapshot of the compositor (for hyprctl and friends). */
  wm: () => Pick<WmState, 'windows' | 'active'>
}

export interface AppDef {
  id: string
  title: string
  icon: string
  load: () => Promise<{ default: ComponentType<AppCtx> }>
  defaultSize?: { w: number; h: number }
}

export const APPS: Record<string, AppDef> = {
  terminal: {
    id: 'terminal',
    title: 'kitty',
    icon: 'terminal',
    load: () => import('./terminal/Terminal'),
  },
}

/** Warm the chunks for `ids` when the browser is idle, unless the user asked to save data. */
export function prefetchApps(ids: string[]): void {
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200))
  idle(() => {
    for (const id of ids) void APPS[id]?.load()
  })
}
