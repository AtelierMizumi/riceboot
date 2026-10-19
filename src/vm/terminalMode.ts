export type Mode = 'shell' | 'loading' | 'linux' | 'error'

export type ModeEvent =
  | { type: 'request-linux'; supported: boolean }
  | { type: 'booted' }
  | { type: 'failed'; reason: string }
  | { type: 'retry'; supported: boolean }
  | { type: 'leave' }

export type Effect = 'start-vm' | 'stop-vm' | 'show-unsupported'

export interface ModeState {
  mode: Mode
  reason?: string
}

/** Pure transition table for the Terminal's shell / linux modes. Unlisted pairs keep the state and do nothing. */
export function nextMode(s: ModeState, e: ModeEvent): { state: ModeState; effects: Effect[] } {
  const stay = { state: s, effects: [] as Effect[] }
  switch (e.type) {
    case 'request-linux':
      if (s.mode !== 'shell') return stay
      return e.supported
        ? { state: { mode: 'loading' }, effects: ['start-vm'] }
        : { state: s, effects: ['show-unsupported'] }
    case 'booted':
      return s.mode === 'loading' ? { state: { mode: 'linux' }, effects: [] } : stay
    case 'failed':
      return s.mode === 'loading' ? { state: { mode: 'error', reason: e.reason }, effects: [] } : stay
    case 'retry':
      return s.mode === 'error' && e.supported ? { state: { mode: 'loading' }, effects: ['start-vm'] } : stay
    case 'leave':
      return s.mode === 'linux' || s.mode === 'loading' || s.mode === 'error'
        ? { state: { mode: 'shell' }, effects: ['stop-vm'] }
        : stay
  }
}
