import type { Command } from '../types'

const C = '\x1b[1;36m'
const B = '\x1b[1;34m'
const R = '\x1b[0m'

const LOGO = [
  '       /\\       ',
  '      /  \\      ',
  '     /\\   \\     ',
  '    /  __  \\    ',
  '   /  (  )  \\   ',
  '  / __|  |__\\\\  ',
  ' /.`        `.\\ ',
  '                ',
]

function uptime(): string {
  const mins = Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) / 60000)
  return mins < 1 ? 'less than a minute' : `${mins} min${mins === 1 ? '' : 's'}`
}

export const fastfetch: Command = async (_a, ctx) => {
  const user = ctx.env.user ?? 'user'
  const host = ctx.env.host ?? 'archlinux'
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const cores = nav?.hardwareConcurrency ?? 4
  const mem = (nav as { deviceMemory?: number } | undefined)?.deviceMemory
  const res = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown'
  const title = `${user}@${host}`
  const info = [
    `${B}${user}${R}@${B}${host}${R}`,
    '-'.repeat(title.length),
    `${B}OS${R}: Arch Linux x86_64`,
    `${B}Host${R}: riceboot (your browser)`,
    `${B}Kernel${R}: linux-riceboot 6.17`,
    `${B}Uptime${R}: ${uptime()}`,
    `${B}Packages${R}: 1337 (pacman)`,
    `${B}Shell${R}: rbsh 0.1`,
    `${B}Display${R}: ${res}`,
    `${B}WM${R}: Hyprland (Wayland)`,
    `${B}Theme${R}: catppuccin-mocha`,
    `${B}Terminal${R}: kitty`,
    `${B}CPU${R}: ${cores} cores`,
    `${B}Memory${R}: ${mem ? `${mem} GiB` : 'unknown'}`,
    '',
    [40, 41, 42, 43, 44, 45, 46, 47].map((c) => `\x1b[${c}m   `).join('') + R,
  ]
  const rows = Math.max(LOGO.length, info.length)
  let s = ''
  for (let i = 0; i < rows; i++) s += `${C}${LOGO[i] ?? ' '.repeat(16)}${R}  ${info[i] ?? ''}\n`
  ctx.out(s)
  return 0
}
