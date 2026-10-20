// Builds public/vm: Alpine x86 ISO and a read-only ext2 image of the packages in packages.txt, split into 1 MiB parts.
// Run with: node --experimental-strip-types tools/build-image/build.ts
import { spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHUNK, splitParts } from '../../src/vm/parts.ts'
import { buildManifest, listParts } from './manifest.ts'
import { parseApkIndex, resolveClosure, type PkgRecord } from './resolve.ts'

const REPO = 'https://dl-cdn.alpinelinux.org/alpine/v3.24'
const ISO_NAME = 'alpine-virt-3.24.2-x86.iso'
const IMG_BYTES = 128 * 1024 * 1024
const ISO_PAD = 64 * 1024 * 1024

const root = process.cwd()
const cache = join(root, '.cache/vm')
const out = join(root, 'public/vm')
mkdirSync(cache, { recursive: true })
mkdirSync(out, { recursive: true })

async function download(url: string, dest: string) {
  if (existsSync(dest)) return
  console.log('download', url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

// Alpine .apk files are gzip tar archives with a signature stream first; tar may warn about it but extracts the rest.
function extractApk(file: string, dest: string) {
  spawnSync('tar', ['-xzf', file, '-C', dest], { stdio: 'ignore' })
}

async function loadIndexes(): Promise<PkgRecord[]> {
  const all: PkgRecord[] = []
  for (const repo of ['main', 'community'] as const) {
    const tgz = join(cache, `${repo}-APKINDEX.tar.gz`)
    await download(`${REPO}/${repo}/x86/APKINDEX.tar.gz`, tgz)
    const dir = join(cache, `index-${repo}`)
    mkdirSync(dir, { recursive: true })
    execFileSync('tar', ['-xzf', tgz, '-C', dir])
    all.push(...parseApkIndex(readFileSync(join(dir, 'APKINDEX'), 'utf8'), repo))
  }
  return all
}

async function main() {
  const targets = readFileSync(join(root, 'tools/build-image/packages.txt'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  const closure = resolveClosure(await loadIndexes(), targets)
  console.log(`closure: ${closure.length} packages`)

  const pkgDir = join(cache, 'pkgs')
  const rootfs = join(cache, 'root')
  mkdirSync(pkgDir, { recursive: true })
  rmSync(rootfs, { recursive: true, force: true })
  mkdirSync(rootfs, { recursive: true })
  for (const p of closure) {
    const file = join(pkgDir, `${p.name}-${p.version}.apk`)
    await download(`${REPO}/${p.repo}/x86/${p.name}-${p.version}.apk`, file)
    extractApk(file, rootfs)
  }

  const img = join(cache, 'rice.img')
  rmSync(img, { force: true })
  // Fixed UUID and timestamps so the same inputs produce the same image bytes.
  execFileSync('mke2fs', ['-q', '-t', 'ext2', '-F', '-U', '6f1a2b3c-0000-4000-8000-000000000001', '-E', 'hash_seed=6f1a2b3c-0000-4000-8000-000000000002', '-d', rootfs, img, '128M'], {
    stdio: 'inherit',
    env: { ...process.env, SOURCE_DATE_EPOCH: '1767225600' },
  })
  const imgBytes = readFileSync(img)
  if (imgBytes.length !== IMG_BYTES) throw new Error(`image is ${imgBytes.length} bytes, expected ${IMG_BYTES}`)

  const isoPath = join(cache, ISO_NAME)
  await download(`${REPO}/releases/x86/${ISO_NAME}`, isoPath)
  const iso = readFileSync(isoPath)

  for (const f of readdirSync(out)) {
    if (/^(rice|alpine)-\d+-\d+\.(img|iso)$/.test(f)) rmSync(join(out, f))
  }
  const parts = [...splitParts(iso, 'alpine', '.iso', ISO_PAD), ...splitParts(imgBytes, 'rice', '.img')]
  for (const p of parts) writeFileSync(join(out, p.name), p.bytes)

  const buildId = createHash('sha256')
    .update(closure.map((p) => `${p.name}=${p.version}`).join('\n'))
    .update(String(IMG_BYTES))
    .digest('hex')
    .slice(0, 12)
  const manifest = buildManifest({
    buildId,
    cdrom: { base: 'alpine', ext: '.iso', size: ISO_PAD },
    hda: { base: 'rice', ext: '.img', size: IMG_BYTES },
    packages: closure.map((p) => `${p.name} ${p.version}`),
  })
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`wrote ${parts.length} parts, ${listParts(manifest.hda).length} disk parts, buildId ${buildId}, chunk ${CHUNK}`)
}

await main()
