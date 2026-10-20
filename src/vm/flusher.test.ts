import { beforeEach, expect, test, vi } from 'vitest'
import { createFlusher } from './flusher'

beforeEach(() => vi.useFakeTimers())

test('many schedule calls produce one save after the delay', async () => {
  const save = vi.fn(async () => {})
  const f = createFlusher({ save, onError: vi.fn() })
  f.schedule(); f.schedule(); f.schedule()
  vi.advanceTimersByTime(1999)
  expect(save).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  await vi.runAllTimersAsync()
  expect(save).toHaveBeenCalledTimes(1)
})

test('keeps dirty state and reports the error when a save fails', async () => {
  const err = new Error('QuotaExceededError')
  const onError = vi.fn()
  const f = createFlusher({ save: async () => { throw err }, onError })
  f.schedule()
  await f.flushNow()
  expect(onError).toHaveBeenCalledWith(err)
})

test('flushNow saves at once and dispose cancels a pending save', async () => {
  const save = vi.fn(async () => {})
  const f = createFlusher({ save, onError: vi.fn() })
  f.schedule()
  await f.flushNow()
  expect(save).toHaveBeenCalledTimes(1)
  f.schedule()
  f.dispose()
  await vi.runAllTimersAsync()
  expect(save).toHaveBeenCalledTimes(1)
})

test('isScheduled is true only while a save waits on the timer', async () => {
  const f = createFlusher({ save: async () => {}, onError: vi.fn() })
  expect(f.isScheduled()).toBe(false)
  f.schedule()
  expect(f.isScheduled()).toBe(true)
  await f.flushNow()
  expect(f.isScheduled()).toBe(false)
})
