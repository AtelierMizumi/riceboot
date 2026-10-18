export interface Segment {
  args: string[]
  redirect?: { path: string; append: boolean }
}

/** Split a line into `&&`-chained segments, honouring single/double quotes and > / >> redirects. */
export function parseLine(line: string): Segment[] {
  const tokens: { v: string; op: boolean }[] = []
  let cur = ''
  let has = false
  let quote: '"' | "'" | null = null
  const push = () => {
    if (has) tokens.push({ v: cur, op: false })
    cur = ''
    has = false
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = null
      else cur += c
    } else if (c === '"' || c === "'") {
      quote = c
      has = true
    } else if (/\s/.test(c)) {
      push()
    } else if (c === '&' && line[i + 1] === '&') {
      push()
      tokens.push({ v: '&&', op: true })
      i++
    } else if (c === '>') {
      push()
      const append = line[i + 1] === '>'
      tokens.push({ v: append ? '>>' : '>', op: true })
      if (append) i++
    } else {
      cur += c
      has = true
    }
  }
  push()

  const segments: Segment[] = []
  let seg: Segment = { args: [] }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.op && t.v === '&&') {
      segments.push(seg)
      seg = { args: [] }
    } else if (t.op) {
      const target = tokens[i + 1]
      if (target && !target.op) {
        seg.redirect = { path: target.v, append: t.v === '>>' }
        i++
      }
    } else {
      seg.args.push(t.v)
    }
  }
  segments.push(seg)
  return segments.filter((s) => s.args.length)
}
