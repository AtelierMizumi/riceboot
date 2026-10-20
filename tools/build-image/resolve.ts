export interface PkgRecord {
  name: string
  version: string
  repo: 'main' | 'community'
  depends: string[]
  provides: string[]
}

/** Strip version constraints such as `=1.2`, `>=3.5` or `~1`. */
const bare = (token: string) => token.replace(/[<>=~].*$/, '')

/** Parse an APKINDEX text (blank-line separated records, `K:value` lines). */
export function parseApkIndex(text: string, repo: 'main' | 'community'): PkgRecord[] {
  const out: PkgRecord[] = []
  for (const block of text.split(/\n\s*\n/)) {
    const fields = new Map<string, string>()
    for (const line of block.split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) fields.set(line.slice(0, i), line.slice(i + 1).trim())
    }
    const name = fields.get('P')
    const version = fields.get('V')
    if (!name || !version) continue
    out.push({
      name,
      version,
      repo,
      depends: (fields.get('D') ?? '').split(/\s+/).filter((t) => t && !t.startsWith('!')).map(bare),
      provides: (fields.get('p') ?? '').split(/\s+/).filter(Boolean).map(bare),
    })
  }
  return out
}

/** Dependency closure of `targets`, sorted by name. Dependencies may be names or `so:`/`cmd:` provides. */
export function resolveClosure(all: PkgRecord[], targets: string[]): PkgRecord[] {
  const byName = new Map<string, PkgRecord>()
  const byProvide = new Map<string, PkgRecord>()
  for (const p of all) {
    byName.set(p.name, p)
    for (const prov of p.provides) byProvide.set(prov, p)
  }
  const lookup = (token: string): PkgRecord | undefined => byName.get(token) ?? byProvide.get(token)

  const seen = new Map<string, PkgRecord>()
  const visit = (token: string) => {
    const rec = lookup(token)
    if (!rec) throw new Error(`unknown package or dependency: ${token}`)
    if (seen.has(rec.name)) return
    seen.set(rec.name, rec)
    for (const dep of rec.depends) visit(dep)
  }
  for (const t of targets) visit(t)
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
