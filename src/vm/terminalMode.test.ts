import { expect, test } from 'vitest'
import { nextMode } from './terminalMode'

const shell = { mode: 'shell' as const }

test('refuses linux when the runtime is unsupported', () => {
  const r = nextMode(shell, { type: 'request-linux', supported: false })
  expect(r.state.mode).toBe('shell')
  expect(r.effects).toEqual(['show-unsupported'])
})

test('request-linux loads the VM and boot completes to linux', () => {
  const loading = nextMode(shell, { type: 'request-linux', supported: true })
  expect(loading.state.mode).toBe('loading')
  expect(loading.effects).toEqual(['start-vm'])
  expect(nextMode(loading.state, { type: 'booted' }).state.mode).toBe('linux')
})

test('failed boot moves to error and can retry', () => {
  const failed = nextMode({ mode: 'loading' }, { type: 'failed', reason: 'part 12 missing' })
  expect(failed.state).toEqual({ mode: 'error', reason: 'part 12 missing' })
  const again = nextMode(failed.state, { type: 'retry', supported: true })
  expect(again.state.mode).toBe('loading')
  expect(again.effects).toEqual(['start-vm'])
})

test('leaving linux stops the VM', () => {
  const r = nextMode({ mode: 'linux' }, { type: 'leave' })
  expect(r.state.mode).toBe('shell')
  expect(r.effects).toEqual(['stop-vm'])
})

test('leaving while loading also stops the VM', () => {
  const r = nextMode({ mode: 'loading' }, { type: 'leave' })
  expect(r.state.mode).toBe('shell')
  expect(r.effects).toEqual(['stop-vm'])
})
