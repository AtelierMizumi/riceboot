import hyprlandConf from '../../themes/hyprland/default.conf?raw'
import { createIdbVfs } from './idb'
import { createMemoryVfs } from './memory'
import type { Vfs } from './types'

export * from './types'
export { normalize, dirname, basename, join } from './path'

export const HOME = '/home/user'

/** IndexedDB-backed Vfs, or a volatile one when storage is unavailable (e.g. private mode). */
export async function createVfs(): Promise<Vfs> {
  try {
    return await createIdbVfs()
  } catch {
    return createMemoryVfs()
  }
}

const README = `Welcome to riceboot!

This is a riced Arch Linux desktop running in your browser.

  Alt + Enter    open a terminal
  Alt + Q        close the focused window
  Alt + 1..0     switch workspace
  Alt + V        toggle floating
  Alt + F        fullscreen

Try typing \`fastfetch\` in the terminal.
Your rice lives in ~/.config/hypr/hyprland.conf
`

const OS_RELEASE = `NAME="Arch Linux"
PRETTY_NAME="Arch Linux"
ID=arch
BUILD_ID=rolling
HOME_URL="https://archlinux.org/"
`

/** Create the default home tree. Idempotent: never overwrites existing files. */
export async function seedHome(vfs: Vfs): Promise<void> {
  for (const d of ['Documents', 'Downloads', 'Pictures', '.config/hypr']) {
    await vfs.mkdir(`${HOME}/${d}`, { recursive: true })
  }
  await vfs.mkdir('/etc', { recursive: true })
  const files: [string, string][] = [
    [`${HOME}/README.txt`, README],
    [`${HOME}/.config/hypr/hyprland.conf`, hyprlandConf],
    ['/etc/os-release', OS_RELEASE],
  ]
  for (const [p, data] of files) {
    if (!(await vfs.exists(p))) await vfs.writeFile(p, data)
  }
}
