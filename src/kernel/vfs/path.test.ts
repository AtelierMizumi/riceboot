import { describe, expect, test } from 'vitest'
import { basename, dirname, join, normalize } from './path'

describe('normalize', () => {
  test('resolves relative paths against cwd', () => {
    expect(normalize('a/../b', '/home/user')).toBe('/home/user/b')
  })
  test('.. at root stays at root', () => {
    expect(normalize('..', '/')).toBe('/')
  })
  test('expands ~ and drops trailing slash', () => {
    expect(normalize('~/x/', '/', '/home/user')).toBe('/home/user/x')
  })
  test('collapses repeated slashes', () => {
    expect(normalize('//etc///hypr/')).toBe('/etc/hypr')
  })
  test('bare ~ is home', () => {
    expect(normalize('~', '/tmp', '/home/user')).toBe('/home/user')
  })
})

test('basename / dirname / join', () => {
  expect(basename('/a/b.txt')).toBe('b.txt')
  expect(dirname('/a')).toBe('/')
  expect(dirname('/a/b/c')).toBe('/a/b')
  expect(join('/a', 'b', '../c')).toBe('/a/c')
})
