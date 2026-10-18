import { beforeEach, expect, test } from 'vitest'
import { dwindle } from './layout/dwindle'
import { createWmStore } from './store'

const area = { x: 0, y: 34, w: 1000, h: 566 }
let wm: ReturnType<typeof createWmStore>
const s = () => wm.getState()

beforeEach(() => {
  wm = createWmStore()
  s().setArea(area)
})

test('open puts window on active workspace, focuses it, and tiles with dwindle', () => {
  const a = s().open('terminal', 'kitty')
  const b = s().open('terminal', 'kitty')
  expect(s().windows[a].workspace).toBe(1)
  expect(s().focused).toBe(b)
  expect(s().layout()).toEqual(dwindle([a, b], area, s().gaps))
})

test('closing the only window leaves an empty layout', () => {
  const a = s().open('terminal', 'kitty')
  s().close(a)
  expect(s().layout()).toEqual({})
  expect(s().focused).toBeNull()
  expect(s().windows[a]).toBeUndefined()
})

test('closing the focused window focuses the previous one in order', () => {
  const a = s().open('terminal', 'a')
  const b = s().open('terminal', 'b')
  const c = s().open('terminal', 'c')
  s().focus(b)
  s().close(b)
  expect(s().focused).toBe(a)
  s().close(a)
  expect(s().focused).toBe(c)
})

test('killactive on empty workspace is a no-op', () => {
  expect(() => s().killActive()).not.toThrow()
  expect(s().focused).toBeNull()
})

test('killactive closes the focused window', () => {
  const a = s().open('terminal', 'a')
  s().killActive()
  expect(s().windows[a]).toBeUndefined()
})

test('workspaces isolate windows', () => {
  const a = s().open('terminal', 'a')
  s().switchWorkspace(3)
  expect(s().active).toBe(3)
  expect(s().focused).toBeNull()
  const b = s().open('terminal', 'b')
  expect(s().windows[b].workspace).toBe(3)
  expect(Object.keys(s().layout())).toEqual([b])
  s().switchWorkspace(1)
  expect(Object.keys(s().layout())).toEqual([a])
  expect(s().focused).toBe(a)
})

test('switchWorkspace ignores out-of-range numbers', () => {
  s().switchWorkspace(0)
  s().switchWorkspace(11)
  expect(s().active).toBe(1)
  s().switchWorkspace(10)
  expect(s().active).toBe(10)
})

test('moveToWorkspace moves a window and refocuses', () => {
  const a = s().open('terminal', 'a')
  const b = s().open('terminal', 'b')
  s().moveToWorkspace(b, 2)
  expect(s().windows[b].workspace).toBe(2)
  expect(Object.keys(s().layout())).toEqual([a])
  expect(s().focused).toBe(a)
  s().switchWorkspace(2)
  expect(Object.keys(s().layout())).toEqual([b])
})

test('toggleFloating takes window out of tiling with a centered 60% rect (whole px)', () => {
  const a = s().open('terminal', 'a')
  const b = s().open('terminal', 'b')
  s().toggleFloating(b)
  const l = s().layout()
  expect(l[a]).toEqual(dwindle([a], area, s().gaps)[a])
  expect(l[b]).toEqual({ x: 200, y: 147, w: 600, h: 340 })
  s().toggleFloating(b)
  expect(s().layout()).toEqual(dwindle([a, b], area, s().gaps))
})

test('setFloatRect updates a floating window rect', () => {
  const a = s().open('terminal', 'a')
  s().toggleFloating(a)
  s().setFloatRect(a, { x: 10, y: 50, w: 300, h: 200 })
  expect(s().layout()[a]).toEqual({ x: 10, y: 50, w: 300, h: 200 })
})

test('toggleFullscreen makes the rect equal the area', () => {
  const a = s().open('terminal', 'a')
  s().open('terminal', 'b')
  s().toggleFullscreen(a)
  expect(s().layout()[a]).toEqual(area)
  s().toggleFullscreen(a)
  expect(s().layout()[a]).not.toEqual(area)
})

test('setArea changes the layout', () => {
  const a = s().open('terminal', 'a')
  const before = s().layout()[a]
  s().setArea({ x: 0, y: 34, w: 500, h: 300 })
  expect(s().layout()[a]).not.toEqual(before)
})

test('setArea clamps negative sizes (window shorter than the bar)', () => {
  s().setArea({ x: 0, y: 34, w: 300, h: -20 })
  expect(s().area.h).toBeGreaterThanOrEqual(1)
  const a = s().open('terminal', 'a')
  s().toggleFullscreen(a)
  expect(s().layout()[a].h).toBeGreaterThanOrEqual(1)
})

test('floating windows are kept inside the area after a resize', () => {
  const a = s().open('terminal', 'a')
  s().toggleFloating(a)
  s().setFloatRect(a, { x: 900, y: 500, w: 400, h: 300 })
  s().setArea({ x: 0, y: 34, w: 640, h: 400 })
  const r = s().layout()[a]
  expect(r.x).toBeGreaterThanOrEqual(0)
  expect(r.y).toBeGreaterThanOrEqual(34)
  expect(r.x + r.w).toBeLessThanOrEqual(640)
  expect(r.y + r.h).toBeLessThanOrEqual(434)
})
