// Copies the v86 runtime and BIOS images into public/vm/runtime/ (run before build and vm:build).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BIOS_FILES, biosUrl, verifyBios } from './bios.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public/vm/runtime')
mkdirSync(out, { recursive: true })

for (const f of ['libv86.js', 'v86.wasm']) {
  copyFileSync(join(root, 'node_modules/v86/build', f), join(out, f))
}

// The v86 npm package does not ship BIOS images; fetch them from one pinned upstream commit and verify SHA-256.
for (const [f, sha] of Object.entries(BIOS_FILES)) {
  const dest = join(out, f)
  if (existsSync(dest)) {
    verifyBios(f, readFileSync(dest), sha)
    continue
  }
  const res = await fetch(biosUrl(f))
  if (!res.ok) throw new Error(`failed to fetch ${f}: ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  verifyBios(f, bytes, sha)
  writeFileSync(dest, bytes)
}
console.log('runtime copied to', out)
