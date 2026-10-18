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
