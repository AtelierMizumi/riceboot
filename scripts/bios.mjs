import { createHash } from 'node:crypto'

// BIOS images are fetched from one pinned upstream commit and checked by SHA-256 (cached and fresh).
export const BIOS_COMMIT = 'cc37f35c43bf14865d74ad76879ecf9410f69eb1'
export const BIOS_FILES = {
  'seabios.bin': '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98',
  'vgabios.bin': 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880',
}

export function biosUrl(name) {
  return `https://github.com/copy/v86/raw/${BIOS_COMMIT}/bios/${name}`
}

export function verifyBios(name, bytes, expectedSha256) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expectedSha256) throw new Error(`${name} failed checksum: expected ${expectedSha256}, got ${actual}`)
}
