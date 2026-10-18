import type { ThemePack } from './types'

export type { ThemePack, ThemeTokens } from './types'

const loaders: Record<ThemePack['id'], () => Promise<{ default: ThemePack }>> = {
  hyprland: () => import('./hyprland'),
  caelestia: () => Promise.reject(new Error('caelestia theme arrives in M2')),
}

export async function loadTheme(id: ThemePack['id']): Promise<ThemePack> {
  return (await loaders[id]()).default
}
