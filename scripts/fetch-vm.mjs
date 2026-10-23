// Cloudflare build step: fills public/vm from a pinned GitHub release instead of building the image on Cloudflare.
// The image is built by .github/workflows/vm-image.yml. After a build, pin its tag and sha256 in scripts/vm-release.json.
// Run with: node scripts/fetch-vm.mjs   (skips when public/vm/manifest.json exists; FORCE=1 refetches)
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'AtelierMizumi/riceboot'
export const ARCHIVE = 'riceboot-vm.tar'

export function releaseAssetUrl(tag, file) {
  return `https://github.com/${REPO}/releases/download/${tag}/${file}`
}

export function verifyArchive(name, bytes, expectedSha256) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expectedSha256) throw new Error(`${name} failed checksum: expected ${expectedSha256}, got ${actual}`)
}

// `tar -tvf` lines: "<type+perms> <owner/group> <size> <date> <time> <name>". Only plain files and directories under vm/ are allowed.
export function checkArchiveListing(lines) {
  for (const line of lines) {
    const fields = line.trim().split(/\s+/)
    const type = fields[0]?.[0]
    const name = fields.slice(5).join(' ')
    if (type !== '-' && type !== 'd') throw new Error(`unsafe archive entry (type ${type}): ${line}`)
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error(`unsafe archive entry (path): ${line}`)
    if (name !== 'vm' && !name.startsWith('vm/')) throw new Error(`unsafe archive entry (outside vm/): ${line}`)
  }
}

async function main() {
  const root = process.cwd()
  if (existsSync(join(root, 'public/vm/manifest.json')) && process.env.FORCE !== '1') {
    console.log('public/vm already present; skipping fetch')
    return
  }
  const pin = JSON.parse(readFileSync(join(root, 'scripts/vm-release.json'), 'utf8'))
  if (!pin.tag || !pin.sha256) throw new Error('no pinned VM release: run the vm-image workflow and set scripts/vm-release.json')

  const res = await fetch(releaseAssetUrl(pin.tag, ARCHIVE))
  if (!res.ok) throw new Error(`fetch ${ARCHIVE} (${pin.tag}) failed: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  verifyArchive(ARCHIVE, bytes, pin.sha256)

  const cache = join(root, '.cache/vm')
  const archivePath = join(cache, ARCHIVE)
  const staging = join(cache, 'extract')
  mkdirSync(cache, { recursive: true })
  writeFileSync(archivePath, bytes)
  checkArchiveListing(execFileSync('tar', ['-tvf', archivePath]).toString().split('\n').filter(Boolean))

  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  execFileSync('tar', ['-xf', archivePath, '--no-same-owner', '-C', staging], { stdio: 'inherit' })
  rmSync(join(root, 'public/vm'), { recursive: true, force: true })
  renameSync(join(staging, 'vm'), join(root, 'public/vm'))
  console.log(`installed ${pin.tag} into public/vm`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
