import { expect, test } from 'vitest'
import { dwindle } from './dwindle'

const area = { x: 0, y: 0, w: 1000, h: 600 }
const gaps = { inner: 10, outer: 20 }

test('empty list gives empty layout', () => {
  expect(dwindle([], area, gaps)).toEqual({})
})

test('one window fills area minus outer gaps', () => {
  expect(dwindle(['a'], area, gaps)).toEqual({ a: { x: 20, y: 20, w: 960, h: 560 } })
})

test('two windows split vertically when wide', () => {
  expect(dwindle(['a', 'b'], area, gaps)).toEqual({
    a: { x: 20, y: 20, w: 475, h: 560 },
    b: { x: 505, y: 20, w: 475, h: 560 },
  })
})

test('third window splits the last one horizontally when tall', () => {
  const r = dwindle(['a', 'b', 'c'], area, gaps)
  expect(r.a).toEqual({ x: 20, y: 20, w: 475, h: 560 })
  expect(r.b).toEqual({ x: 505, y: 20, w: 475, h: 275 })
  expect(r.c).toEqual({ x: 505, y: 305, w: 475, h: 275 })
})

test('respects area offset', () => {
  expect(dwindle(['a'], { x: 0, y: 34, w: 1000, h: 566 }, gaps).a).toEqual({ x: 20, y: 54, w: 960, h: 526 })
})

test('never yields negative or zero sizes on tiny area', () => {
  const r = dwindle(['a', 'b', 'c', 'd', 'e', 'f'], { x: 0, y: 0, w: 50, h: 40 }, gaps)
  expect(Object.keys(r)).toHaveLength(6)
  for (const rect of Object.values(r)) {
    expect(rect.w).toBeGreaterThanOrEqual(1)
    expect(rect.h).toBeGreaterThanOrEqual(1)
  }
})
