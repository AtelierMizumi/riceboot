export type Action =
  | 'exec:terminal'
  | 'killactive'
  | 'togglefloating'
  | 'fullscreen'
  | 'launcher'
  | `workspace:${number}`
  | `movetoworkspace:${number}`

export interface Binding {
  /** e.g. "MOD+Return", "MOD+SHIFT+1". MOD resolves to the configured mod key. */
  combo: string
  action: Action
}

export type ModKey = 'Alt' | 'Meta' | 'Control'

export interface Combo {
  key: string
  alt: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
}

const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

export const DEFAULT_BINDINGS: Binding[] = [
  { combo: 'MOD+Return', action: 'exec:terminal' },
  { combo: 'MOD+Q', action: 'killactive' },
  { combo: 'MOD+V', action: 'togglefloating' },
  { combo: 'MOD+F', action: 'fullscreen' },
  ...digits.map((d, i): Binding => ({ combo: `MOD+${d}`, action: `workspace:${i + 1}` })),
  ...digits.map((d, i): Binding => ({ combo: `MOD+SHIFT+${d}`, action: `movetoworkspace:${i + 1}` })),
]

export function parseCombo(combo: string, mod: ModKey): Combo {
  const out: Combo = { key: '', alt: false, ctrl: false, meta: false, shift: false }
  for (const raw of combo.split('+')) {
    const part = raw.trim().toUpperCase()
    const m = part === 'MOD' ? mod.toUpperCase() : part
    if (m === 'ALT') out.alt = true
    else if (m === 'CONTROL' || m === 'CTRL') out.ctrl = true
    else if (m === 'META' || m === 'SUPER') out.meta = true
    else if (m === 'SHIFT') out.shift = true
    else out.key = raw.trim().toLowerCase()
  }
  return out
}

/** Key name of an event: digits and letters by physical code, Enter as "return". */
function eventKey(e: KeyboardEvent): string {
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5)
  // Physical letter: macOS Option and non-Latin layouts change e.key (Option+Q = "œ").
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase()
  if (e.key === 'Enter') return 'return'
  return e.key.toLowerCase()
}

export function createDispatcher(opts: { bindings: Binding[]; mod?: ModKey; run: (a: Action) => void }) {
  const mod = opts.mod ?? 'Alt'
  const table = new Map<string, Action>()
  const sig = (c: Combo) => `${+c.alt}${+c.ctrl}${+c.meta}${+c.shift}:${c.key}`
  for (const b of opts.bindings) table.set(sig(parseCombo(b.combo, mod)), b.action)

  return (e: KeyboardEvent) => {
    if (e.isComposing) return
    const action = table.get(
      sig({ key: eventKey(e), alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey }),
    )
    if (!action) return
    e.preventDefault()
    e.stopPropagation()
    opts.run(action)
  }
}
