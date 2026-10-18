import { beforeEach, expect, test } from 'vitest'
import { createAnimator } from './animator'

let frames: FrameRequestCallback[] = []
let clock = 0
const raf = (cb: FrameRequestCallback) => frames.push(cb)
const now = () => clock
const tick = (ms: number) => {
  clock += ms
  const run = frames
  frames = []
  run.forEach((f) => f(clock))
}
const linear = (t: number) => t

beforeEach(() => {
  frames = []
  clock = 0
})

test('tweens transform and size to the target rect', async () => {
  const el = document.createElement('div')
  const a = createAnimator(raf, now)
  const done = a.animate(el, { x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 100, w: 300, h: 200 }, { durationMs: 100, ease: linear })
  tick(0)
  tick(50)
  expect(el.style.transform).toBe('translate(100px, 50px)')
  expect(el.style.width).toBe('200px')
  expect(el.style.willChange).toBe('transform')
  tick(50)
  await done
  expect(el.style.transform).toBe('translate(200px, 100px)')
  expect(el.style.width).toBe('300px')
  expect(el.style.height).toBe('200px')
  expect(el.style.willChange).toBe('')
})

test('tweens opacity when given', async () => {
  const el = document.createElement('div')
  const r = { x: 0, y: 0, w: 10, h: 10 }
  const done = createAnimator(raf, now).animate(el, r, r, { durationMs: 100, ease: linear, opacity: [0, 1] })
  tick(0)
  tick(25)
  expect(el.style.opacity).toBe('0.25')
  tick(100)
  await done
  expect(el.style.opacity).toBe('1')
})

test('cancel stops further updates', () => {
  const el = document.createElement('div')
  const a = createAnimator(raf, now)
  void a.animate(el, { x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 }, { durationMs: 100, ease: linear })
  tick(0)
  tick(10)
  const before = el.style.transform
  a.cancel(el)
  tick(50)
  expect(el.style.transform).toBe(before)
})

test('a new animation on the same element replaces the old one', async () => {
  const el = document.createElement('div')
  const a = createAnimator(raf, now)
  const r0 = { x: 0, y: 0, w: 10, h: 10 }
  void a.animate(el, r0, { x: 100, y: 0, w: 10, h: 10 }, { durationMs: 100, ease: linear })
  const second = a.animate(el, r0, { x: 0, y: 40, w: 10, h: 10 }, { durationMs: 100, ease: linear })
  tick(0)
  tick(100)
  await second
  expect(el.style.transform).toBe('translate(0px, 40px)')
})
