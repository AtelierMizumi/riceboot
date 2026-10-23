import { expect, test } from 'vitest'
import { releaseAssetUrl, verifyArchive, parseSha256File } from './fetch-vm.mjs'

const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

test('release assets come from the latest GitHub release of riceboot', () => {
  expect(releaseAssetUrl('riceboot-vm.tar')).toBe('https://github.com/AtelierMizumi/riceboot/releases/latest/download/riceboot-vm.tar')
})

test('accepts an archive whose sha256 matches the published checksum', () => {
  expect(() => verifyArchive('riceboot-vm.tar', Buffer.from('abc'), sha)).not.toThrow()
})

test('rejects an archive whose sha256 does not match', () => {
  expect(() => verifyArchive('riceboot-vm.tar', Buffer.from('abd'), sha)).toThrow(/riceboot-vm\.tar.*checksum/)
})

test('reads the hash from a sha256sum-style line', () => {
  expect(parseSha256File(`${sha}  riceboot-vm.tar\n`)).toBe(sha)
})

test('rejects a checksum file that does not hold a sha256', () => {
  expect(() => parseSha256File('not a hash')).toThrow(/sha256/)
})
