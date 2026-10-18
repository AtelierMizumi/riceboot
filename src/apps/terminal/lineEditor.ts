export interface LineEditor {
  /** Feed raw terminal input (keys, escape sequences or pasted text). */
  feed(data: string): void
  readonly history: string[]
}

export interface LineEditorOptions {
  /** Called per line. If it returns a promise, later input waits until it settles. */
  onSubmit(line: string): unknown
  /** Ctrl+C: the line was discarded; redraw the prompt. */
  onInterrupt?(): void
  write(s: string): void
}

// eslint-disable-next-line no-control-regex -- ANSI escape sequences
const ESC_RE = /^\x1b\[[0-9;]*[A-Za-z~]/

/**
 * Readline-style editing of one input line, independent of xterm. Input that
 * arrives while a submitted line is still running is queued, so pasted
 * multi-line text runs one command at a time.
 */
export function createLineEditor(opts: LineEditorOptions): LineEditor {
  const history: string[] = []
  let buf = ''
  let pos = 0
  let hIndex = -1 // -1 = editing the draft
  let draft = ''
  let pending = ''
  let running = false
  const { write } = opts

  /** Replace the whole visible line with `next`, cursor at end. */
  const replace = (next: string) => {
    if (pos > 0) write(`\x1b[${pos}D`)
    write('\x1b[K' + next)
    buf = next
    pos = next.length
  }

  const insert = (text: string) => {
    const tail = buf.slice(pos)
    buf = buf.slice(0, pos) + text + tail
    pos += text.length
    write(text + tail + (tail.length ? `\x1b[${tail.length}D` : ''))
  }

  const handleEscape = (seq: string) => {
    switch (seq.at(-1)) {
      case 'A':
        if (!history.length || hIndex === 0) return
        if (hIndex === -1) {
          draft = buf
          hIndex = history.length - 1
        } else hIndex--
        replace(history[hIndex])
        return
      case 'B':
        if (hIndex === -1) return
        hIndex++
        if (hIndex >= history.length) {
          hIndex = -1
          replace(draft)
        } else replace(history[hIndex])
        return
      case 'C':
        if (pos < buf.length) {
          pos++
          write(seq)
        }
        return
      case 'D':
        if (pos > 0) {
          pos--
          write(seq)
        }
        return
    }
  }

  const submit = () => {
    write('\r\n')
    const line = buf
    if (line.trim() && history.at(-1) !== line) history.push(line)
    buf = ''
    pos = 0
    hIndex = -1
    const result = opts.onSubmit(line)
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      running = true
      const resume = () => {
        running = false
        pump()
      }
      ;(result as Promise<unknown>).then(resume, resume)
    }
  }

  const pump = () => {
    while (pending && !running) {
      const esc = ESC_RE.exec(pending)
      if (esc) {
        pending = pending.slice(esc[0].length)
        handleEscape(esc[0])
        continue
      }
      const c = pending[0]
      pending = pending.slice(1)
      if (c === '\n' && prevWasCR) {
        prevWasCR = false
        continue
      }
      prevWasCR = c === '\r'
      if (c === '\r' || c === '\n') {
        submit()
      } else if (c === '\x7f' || c === '\b') {
        if (pos === 0) continue
        const tail = buf.slice(pos)
        buf = buf.slice(0, pos - 1) + tail
        pos--
        write('\b' + tail + ' ' + `\x1b[${tail.length + 1}D`)
      } else if (c === '\x03') {
        write('^C\r\n')
        buf = ''
        pos = 0
        hIndex = -1
        opts.onInterrupt?.()
      } else if (c >= ' ') {
        insert(c)
      }
    }
  }
  let prevWasCR = false

  return {
    feed(data) {
      pending += data
      pump()
    },
    history,
  }
}
