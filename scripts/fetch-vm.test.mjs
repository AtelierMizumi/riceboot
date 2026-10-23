import { expect, test } from 'vitest'
import { releaseAssetUrl, verifyArchive, checkArchiveListing } from './fetch-vm.mjs'

const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const file = (path) => `-rw-r--r-- 0/0 1048576 2026-01-01 00:00 ${path}`

test('release assets are addressed by an explicit tag, never by "latest"', () => {
  expect(releaseAssetUrl('vm-7', 'riceboot-vm.tar')).toBe('https://github.com/AtelierMizumi/riceboot/releases/download/vm-7/riceboot-vm.tar')
})

test('accepts an archive whose sha256 matches the pinned value', () => {
  expect(() => verifyArchive('riceboot-vm.tar', Buffer.from('abc'), sha)).not.toThrow()
})

test('rejects an archive whose sha256 does not match the pinned value', () => {
  expect(() => verifyArchive('riceboot-vm.tar', Buffer.from('abd'), sha)).toThrow(/riceboot-vm\.tar.*checksum/)
})

test('accepts entries that all sit under vm/', () => {
  expect(() => checkArchiveListing([file('vm/'), file('vm/manifest.json'), file('vm/rice-0-1048576.img')])).not.toThrow()
})

test('rejects a parent-directory escape', () => {
  expect(() => checkArchiveListing([file('vm/../../etc/evil')])).toThrow(/unsafe/)
})

test('rejects an absolute path', () => {
  expect(() => checkArchiveListing([file('/etc/evil')])).toThrow(/unsafe/)
})

test('rejects an entry outside vm/', () => {
  expect(() => checkArchiveListing([file('other/evil')])).toThrow(/unsafe/)
})

test('rejects a symlink or hard link, whatever its target', () => {
  expect(() => checkArchiveListing(['lrwxrwxrwx 0/0 0 2026-01-01 00:00 vm/x -> /etc/passwd'])).toThrow(/unsafe/)
  expect(() => checkArchiveListing(['hrw-r--r-- 0/0 0 2026-01-01 00:00 vm/x link to vm/y'])).toThrow(/unsafe/)
})
