import { cubicBezier } from '../../compositor/bezier'
import type { ThemePack } from '../types'
import Bar from './Bar'
import './theme.css'

const ease = cubicBezier(0.05, 0.9, 0.1, 1.05)

/** Catppuccin Mocha Hyprland rice. Gaps are hyprland.conf values ×2 in CSS px. */
const hyprland: ThemePack = {
  id: 'hyprland',
  tokens: {
    bg: '#1e1e2e',
    fg: '#cdd6f4',
    accent: '#cba6f7',
    accent2: '#89b4fa',
    borderActive: ['#cba6f7', '#89b4fa'],
    borderInactive: '#45475aaa',
    radius: 10,
    borderSize: 2,
    blur: 8,
    font: '"JetBrainsMono Nerd Font", "JetBrains Mono", ui-monospace, monospace',
    gaps: { inner: 10, outer: 20 },
  },
  curves: { windowIn: ease, workspace: ease, durationMs: 300 },
  components: { Bar },
  barHeight: 34,
  wallpaperCss:
    'radial-gradient(1200px 800px at 15% 20%, #cba6f733, transparent 60%),' +
    'radial-gradient(1000px 700px at 85% 80%, #89b4fa33, transparent 60%),' +
    'radial-gradient(800px 600px at 60% 30%, #f5c2e722, transparent 60%),' +
    'linear-gradient(135deg, #11111b, #1e1e2e 50%, #181825)',
}

export default hyprland
