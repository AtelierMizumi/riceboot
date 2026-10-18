/** Resolve `p` to an absolute, normalized path (no trailing slash except "/"). */
export function normalize(p: string, cwd = '/', home = '/home/user'): string {
  if (p === '~' || p.startsWith('~/')) p = home + p.slice(1)
  const base = p.startsWith('/') ? [] : cwd.split('/')
  const out: string[] = []
  for (const part of [...base, ...p.split('/')]) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

export function dirname(p: string): string {
  const n = normalize(p)
  const i = n.lastIndexOf('/')
  return i <= 0 ? '/' : n.slice(0, i)
}

export function basename(p: string): string {
  const n = normalize(p)
  return n.slice(n.lastIndexOf('/') + 1)
}

export function join(...parts: string[]): string {
  return normalize(parts.join('/'))
}
