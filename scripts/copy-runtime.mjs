// Copies the v86 runtime and BIOS images into public/vm/runtime/ (run before build and vm:build).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public/vm/runtime')
mkdirSync(out, { recursive: true })

for (const f of ['libv86.js', 'v86.wasm']) {
  copyFileSync(join(root, 'node_modules/v86/build', f), join(out, f))
}

// The v86 npm package does not ship BIOS images; fetch them from the upstream repo once.
const BIOS = 'https://github.com/copy/v86/raw/master/bios'
for (const f of ['seabios.bin', 'vgabios.bin']) {
  const dest = join(out, f)
  if (existsSync(dest)) continue
  const res = await fetch(`${BIOS}/${f}`)
  if (!res.ok) throw new Error(`failed to fetch ${f}: ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}
console.log('runtime copied to', out)
