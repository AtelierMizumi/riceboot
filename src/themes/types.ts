import type { ComponentType } from 'react'
import type { Gaps } from '../compositor/layout/dwindle'

export interface ThemeTokens {
  bg: string
  fg: string
  accent: string
  accent2: string
  borderActive: [string, string]
  borderInactive: string
  radius: number
  borderSize: number
  blur: number
  font: string
  gaps: Gaps
}

export interface ThemePack {
  id: 'hyprland' | 'caelestia'
  tokens: ThemeTokens
  curves: { windowIn: (t: number) => number; workspace: (t: number) => number; durationMs: number }
  components: { Bar: ComponentType<{ height: number }> }
  barHeight: number
  /** M1: CSS background; WebGPU wallpapers arrive in M2. */
  wallpaperCss: string
}
