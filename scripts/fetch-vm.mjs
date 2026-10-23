// Cloudflare build step: fills public/vm from the latest GitHub release instead of building the image on Cloudflare.
// The image is built by .github/workflows/vm-image.yml, which publishes riceboot-vm.tar and riceboot-vm.tar.sha256.
// Run with: node scripts/fetch-vm.mjs   (skips when public/vm/manifest.json already exists; FORCE=1 refetches)
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'AtelierMizumi/riceboot'
export const ARCHIVE = 'riceboot-vm.tar'

export function releaseAssetUrl(file) {
  return `https://github.com/${REPO}/releases/latest/download/${file}`
}

export function verifyArchive(name, bytes, expectedSha256) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expectedSha256) throw new Error(`${name} failed checksum: expected ${expectedSha256}, got ${actual}`)
}

// Accepts the `sha256sum` format: "<64 hex>  <file>".
export function parseSha256File(text) {
  const hash = text.trim().split(/\s+/)[0] ?? ''
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('checksum file does not hold a sha256 hash')
  return hash
}

async function main() {
  const root = process.cwd()
  if (existsSync(join(root, 'public/vm/manifest.json')) && process.env.FORCE !== '1') {
    console.log('public/vm already present; skipping fetch')
    return
  }
  const cache = join(root, '.cache/vm')
  mkdirSync(cache, { recursive: true })

  const [archiveRes, shaRes] = await Promise.all([fetch(releaseAssetUrl(ARCHIVE)), fetch(releaseAssetUrl(`${ARCHIVE}.sha256`))])
  if (!archiveRes.ok) throw new Error(`fetch ${ARCHIVE} failed: HTTP ${archiveRes.status}`)
  if (!shaRes.ok) throw new Error(`fetch ${ARCHIVE}.sha256 failed: HTTP ${shaRes.status}`)
  const bytes = Buffer.from(await archiveRes.arrayBuffer())
  verifyArchive(ARCHIVE, bytes, parseSha256File(await shaRes.text()))

  const archivePath = join(cache, ARCHIVE)
  writeFileSync(archivePath, bytes)
  // The archive holds a top-level vm/ directory, which lands in public/vm.
  execFileSync('tar', ['-xf', archivePath, '-C', join(root, 'public')], { stdio: 'inherit' })
  console.log(`extracted ${ARCHIVE} into public/vm`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
