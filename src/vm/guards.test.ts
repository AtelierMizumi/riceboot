import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { canAllocateMemory, createRunGuard, fetchManifest, startWatchdog } from './guards'

test('a run guard treats only the latest run as current, and cancelAll retires it', () => {
  const g = createRunGuard()
  const first = g.next()
  const second = g.next()
  expect(g.isCurrent(first)).toBe(false)
  expect(g.isCurrent(second)).toBe(true)
  g.cancelAll()
  expect(g.isCurrent(second)).toBe(false)
  expect(g.isCurrent(g.next())).toBe(true)
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('a watchdog fires once after its delay and clear() stops it', () => {
  const onTimeout = vi.fn()
  startWatchdog(1000, onTimeout)
  vi.advanceTimersByTime(999)
  expect(onTimeout).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(onTimeout).toHaveBeenCalledTimes(1)

  const cleared = vi.fn()
  const w = startWatchdog(1000, cleared)
  w.clear()
  vi.advanceTimersByTime(5000)
  expect(cleared).not.toHaveBeenCalled()
})

test('memory check accepts a small allocation and refuses an impossible one', () => {
  expect(canAllocateMemory(1024 * 1024, WebAssembly)).toBe(true)
  expect(canAllocateMemory(64 * 1024 * 1024 * 1024, WebAssembly)).toBe(false)
})

test('fetchManifest returns parsed JSON and throws with the status on an HTTP error', async () => {
  const ok = (async () => new Response(JSON.stringify({ buildId: 'b1' }), { status: 200 })) as unknown as typeof fetch
  await expect(fetchManifest('/vm/manifest.json', ok)).resolves.toEqual({ buildId: 'b1' })
  const missing = (async () => new Response('<html>', { status: 404 })) as unknown as typeof fetch
  await expect(fetchManifest('/vm/manifest.json', missing)).rejects.toThrow(/HTTP 404/)
})
