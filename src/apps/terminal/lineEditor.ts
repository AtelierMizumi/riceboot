export interface LineEditor {
  /** Feed raw terminal input (keys, escape sequences or pasted text). */
  feed(data: string): void
  readonly history: string[]
}

// eslint-disable-next-line no-control-regex -- ANSI escape sequences
const ESC_RE = /^\x1b\[[0-9;]*[A-Za-z~]/

/** Readline-style editing of one input line, independent of xterm. */
export function createLineEditor(opts: { onSubmit(line: string): void; write(s: string): void }): LineEditor {
  const history: string[] = []
  let buf = ''
  let pos = 0
  let hIndex = -1 // -1 = editing the draft
  let draft = ''
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

  const feed = (data: string) => {
    let i = 0
    while (i < data.length) {
      const rest = data.slice(i)
      const esc = ESC_RE.exec(rest)
      if (esc) {
        handleEscape(esc[0])
        i += esc[0].length
        continue
      }
      const c = data[i++]
      if (c === '\r' || c === '\n') {
        if (c === '\n' && data[i - 2] === '\r') continue
        write('\r\n')
        const line = buf
        if (line.trim() && history.at(-1) !== line) history.push(line)
        buf = ''
        pos = 0
        hIndex = -1
        opts.onSubmit(line)
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
      } else if (c >= ' ') {
        insert(c)
      }
    }
  }

  return { feed, history }
}
