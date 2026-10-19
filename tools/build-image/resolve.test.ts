import { expect, test } from 'vitest'
import { parseApkIndex, resolveClosure } from './resolve'

const INDEX = `C:Q1abc=
P:fastfetch
V:2.64.2-r0
p:cmd:fastfetch=2.64.2-r0
D:hwdata-pci so:libc.musl-x86.so.1

P:hwdata-pci
V:0.408-r0
D:

P:musl
V:1.2.6-r2
p:so:libc.musl-x86.so.1=1
`

test('parses name, version, depends and provides', () => {
  const [ff] = parseApkIndex(INDEX, 'community')
  expect(ff).toMatchObject({ name: 'fastfetch', version: '2.64.2-r0', repo: 'community' })
  expect(ff.depends).toEqual(['hwdata-pci', 'so:libc.musl-x86.so.1'])
  expect(ff.provides).toEqual(['cmd:fastfetch'])
})

test('closure of fastfetch is fastfetch, hwdata-pci and musl', () => {
  const all = [...parseApkIndex(INDEX, 'community')]
  expect(resolveClosure(all, ['fastfetch']).map((p) => p.name)).toEqual(['fastfetch', 'hwdata-pci', 'musl'])
})

test('unknown target throws', () => {
  expect(() => resolveClosure([], ['nope'])).toThrow(/nope/)
})
