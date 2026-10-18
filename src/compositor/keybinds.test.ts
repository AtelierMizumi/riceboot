import { expect, test, vi } from 'vitest'
import { createDispatcher, DEFAULT_BINDINGS, parseCombo } from './keybinds'

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { cancelable: true, ...init })

test('parseCombo resolves MOD and modifiers', () => {
  expect(parseCombo('MOD+SHIFT+Return', 'Alt')).toEqual({ key: 'return', alt: true, ctrl: false, meta: false, shift: true })
  expect(parseCombo('MOD+q', 'Meta')).toEqual({ key: 'q', alt: false, ctrl: false, meta: true, shift: false })
})

test('uses Alt as default mod', () => {
  const run = vi.fn()
  createDispatcher({ bindings: DEFAULT_BINDINGS, run })(key({ key: 'Enter', code: 'Enter', altKey: true }))
  expect(run).toHaveBeenCalledWith('exec:terminal')
})

test('digits match by code so Shift does not change them', () => {
  const run = vi.fn()
  const d = createDispatcher({ bindings: DEFAULT_BINDINGS, run })
  d(key({ key: '#', code: 'Digit3', altKey: true, shiftKey: true }))
  d(key({ key: '0', code: 'Digit0', altKey: true }))
  expect(run.mock.calls).toEqual([['movetoworkspace:3'], ['workspace:10']])
})

test('letters match case-insensitively', () => {
  const run = vi.fn()
  createDispatcher({ bindings: DEFAULT_BINDINGS, run })(key({ key: 'Q', code: 'KeyQ', altKey: true }))
  expect(run).toHaveBeenCalledWith('killactive')
})

test('prevents default only for bound combos', () => {
  const run = vi.fn()
  const d = createDispatcher({ bindings: DEFAULT_BINDINGS, run })
  const bound = key({ key: 'f', code: 'KeyF', altKey: true })
  const unbound = key({ key: 'x', code: 'KeyX', altKey: true })
  d(bound)
  d(unbound)
  expect(bound.defaultPrevented).toBe(true)
  expect(unbound.defaultPrevented).toBe(false)
  expect(run).toHaveBeenCalledTimes(1)
})

test('extra modifiers do not match', () => {
  const run = vi.fn()
  createDispatcher({ bindings: DEFAULT_BINDINGS, run })(key({ key: 'q', code: 'KeyQ', altKey: true, ctrlKey: true }))
  expect(run).not.toHaveBeenCalled()
})

test('with mod Meta, Alt+Enter does nothing', () => {
  const run = vi.fn()
  const d = createDispatcher({ bindings: DEFAULT_BINDINGS, mod: 'Meta', run })
  d(key({ key: 'Enter', code: 'Enter', altKey: true }))
  expect(run).not.toHaveBeenCalled()
  d(key({ key: 'Enter', code: 'Enter', metaKey: true }))
  expect(run).toHaveBeenCalledWith('exec:terminal')
})

test('ignores events while composing', () => {
  const run = vi.fn()
  createDispatcher({ bindings: DEFAULT_BINDINGS, run })(key({ key: 'Enter', code: 'Enter', altKey: true, isComposing: true }))
  expect(run).not.toHaveBeenCalled()
})

test('default bindings cover the documented actions', () => {
  const actions = DEFAULT_BINDINGS.map((b) => b.action)
  for (const a of ['exec:terminal', 'killactive', 'togglefloating', 'fullscreen', 'workspace:1', 'workspace:10', 'movetoworkspace:10']) {
    expect(actions).toContain(a)
  }
})
