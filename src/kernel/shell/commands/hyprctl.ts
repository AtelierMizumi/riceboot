import type { Command } from '../types'

const USAGE = 'usage: hyprctl [clients|workspaces|version]\n'

export const hyprctl: Command = async ([sub], ctx) => {
  const wm = ctx.env.wm?.()
  switch (sub) {
    case 'version':
      ctx.out('Hyprland 0.51.0 (riceboot web compositor)\n')
      return 0
    case 'clients': {
      for (const w of Object.values(wm?.windows ?? {})) {
        ctx.out(
          `Window ${w.id.slice(0, 8)} -> ${w.title}:\n\tclass: ${w.appId}\n\tworkspace: ${w.workspace}\n\tfloating: ${+w.floating}\n\tfullscreen: ${+w.fullscreen}\n\n`,
        )
      }
      return 0
    }
    case 'workspaces': {
      const counts = new Map<number, number>()
      for (const w of Object.values(wm?.windows ?? {})) counts.set(w.workspace, (counts.get(w.workspace) ?? 0) + 1)
      if (wm && !counts.has(wm.active)) counts.set(wm.active, 0)
      for (const [id, n] of [...counts].sort((a, b) => a[0] - b[0])) {
        ctx.out(`workspace ID ${id}${id === wm?.active ? ' (active)' : ''}:\n\twindows: ${n}\n\n`)
      }
      return 0
    }
    default:
      ctx.err(USAGE)
      return 1
  }
}
