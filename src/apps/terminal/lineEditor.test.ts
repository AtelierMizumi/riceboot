import { beforeEach, expect, test } from 'vitest'
import { createLineEditor } from './lineEditor'

let submitted: string[]
let written: string
let ed: ReturnType<typeof createLineEditor>

beforeEach(() => {
  submitted = []
  written = ''
  ed = createLineEditor({ onSubmit: (l) => submitted.push(l), write: (s) => (written += s) })
})

const UP = '\x1b[A'
const DOWN = '\x1b[B'
const LEFT = '\x1b[D'
const RIGHT = '\x1b[C'

test('typing then Enter submits the line and echoes input', () => {
  ed.feed('ls\r')
  expect(submitted).toEqual(['ls'])
  expect(written).toBe('ls\r\n')
})

test('Backspace deletes the previous char', () => {
  ed.feed('ab\x7f\r')
  expect(submitted).toEqual(['a'])
})

test('Backspace on empty line writes nothing', () => {
  ed.feed('\x7f')
  expect(written).toBe('')
})

test('Up recalls history (consecutive duplicates skipped), Down goes back to the draft', () => {
  ed.feed('one\r')
  ed.feed('two\r')
  ed.feed('dr')
  ed.feed(UP)
  ed.feed('\r')
  expect(submitted.at(-1)).toBe('two')
  ed.feed(UP + UP + '\r')
  expect(submitted.at(-1)).toBe('one')
  ed.feed('x' + UP + DOWN + '\r')
  expect(submitted.at(-1)).toBe('x')
  expect(ed.history).toEqual(['one', 'two', 'one', 'x'])
})

test('Ctrl+C clears the buffer and writes ^C', () => {
  ed.feed('abc')
  written = ''
  ed.feed('\x03')
  expect(written).toBe('^C\r\n')
  ed.feed('\r')
  expect(submitted).toEqual([''])
})

test('Left moves the cursor so typing inserts mid-line', () => {
  ed.feed('ac' + LEFT + 'b\r')
  expect(submitted).toEqual(['abc'])
})

test('Right at end and Left at start are no-ops', () => {
  ed.feed(LEFT + 'a' + RIGHT + RIGHT + 'b\r')
  expect(submitted).toEqual(['ab'])
})

test('pasted multi-line input submits each line', () => {
  ed.feed('pwd\rls\r')
  expect(submitted).toEqual(['pwd', 'ls'])
})

test('empty submissions are not added to history', () => {
  ed.feed('\r\r')
  expect(ed.history).toEqual([])
})

test('pasted lines run one after another when onSubmit is async', async () => {
  const log: string[] = []
  const resolvers: (() => void)[] = []
  const e = createLineEditor({
    write: () => {},
    onSubmit: (l) => {
      log.push('start ' + l)
      return new Promise<void>((r) => resolvers.push(() => (log.push('end ' + l), r())))
    },
  })
  e.feed('mkdir a\rcd a\r')
  expect(log).toEqual(['start mkdir a'])
  resolvers.shift()!()
  await Promise.resolve()
  await Promise.resolve()
  expect(log).toEqual(['start mkdir a', 'end mkdir a', 'start cd a'])
})

test('input typed while a command runs is kept, not dropped', async () => {
  const got: string[] = []
  let release!: () => void
  const e = createLineEditor({
    write: () => {},
    onSubmit: (l) => {
      got.push(l)
      if (l === 'slow') return new Promise<void>((r) => (release = r))
    },
  })
  e.feed('slow\r')
  e.feed('pwd\r')
  expect(got).toEqual(['slow'])
  release()
  await new Promise((r) => setTimeout(r, 0))
  expect(got).toEqual(['slow', 'pwd'])
})

test('a rejected onSubmit does not block later input', async () => {
  const got: string[] = []
  const e = createLineEditor({
    write: () => {},
    onSubmit: (l) => {
      got.push(l)
      if (l === 'boom') return Promise.reject(new Error('x'))
    },
  })
  e.feed('boom\r')
  await new Promise((r) => setTimeout(r, 0))
  e.feed('ok\r')
  await new Promise((r) => setTimeout(r, 0))
  expect(got).toEqual(['boom', 'ok'])
})

test('Ctrl+C calls onInterrupt so the prompt can be redrawn', () => {
  let interrupted = 0
  const e = createLineEditor({ write: () => {}, onSubmit: () => {}, onInterrupt: () => interrupted++ })
  e.feed('abc\x03')
  expect(interrupted).toBe(1)
})
