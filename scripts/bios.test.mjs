import { expect, test } from 'vitest'
import { verifyBios } from './bios.mjs'

test('accepts bytes whose sha256 matches the pinned value', () => {
  const bytes = Buffer.from('abc')
  const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  expect(() => verifyBios('x.bin', bytes, sha)).not.toThrow()
})

test('rejects bytes that do not match the pinned value', () => {
  expect(() => verifyBios('x.bin', Buffer.from('abd'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toThrow(/x\.bin.*checksum/)
})
