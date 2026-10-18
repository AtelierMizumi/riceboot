import { expect, test } from 'vitest'
import type { Vfs } from './types'

/** Behavioural suite every Vfs adapter must pass. */
export function runVfsContract(make: () => Promise<Vfs>) {
  test('write then read returns same string; size is byte length', async () => {
    const vfs = await make()
    await vfs.writeFile('/f.txt', 'héllo')
    expect(await vfs.readFile('/f.txt')).toBe('héllo')
    expect((await vfs.stat('/f.txt')).size).toBe(6)
    expect((await vfs.stat('/f.txt')).type).toBe('file')
  })

  test('writeFile with missing parent rejects ENOENT', async () => {
    const vfs = await make()
    await expect(vfs.writeFile('/nope/x', '')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('readFile on dir rejects EISDIR; readdir on file rejects ENOTDIR', async () => {
    const vfs = await make()
    await vfs.mkdir('/d')
    await vfs.writeFile('/f', '')
    await expect(vfs.readFile('/d')).rejects.toMatchObject({ code: 'EISDIR' })
    await expect(vfs.readdir('/f')).rejects.toMatchObject({ code: 'ENOTDIR' })
  })

  test('readFile on missing file rejects ENOENT', async () => {
    const vfs = await make()
    await expect(vfs.readFile('/missing')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('mkdir recursive creates the chain; readdir is sorted', async () => {
    const vfs = await make()
    await vfs.mkdir('/a/b/c', { recursive: true })
    expect(await vfs.readdir('/a/b')).toEqual(['c'])
    await vfs.writeFile('/a/z', '')
    await vfs.writeFile('/a/m', '')
    expect(await vfs.readdir('/a')).toEqual(['b', 'm', 'z'])
  })

  test('mkdir without recursive on existing path rejects EEXIST', async () => {
    const vfs = await make()
    await vfs.mkdir('/a')
    await expect(vfs.mkdir('/a')).rejects.toMatchObject({ code: 'EEXIST' })
    await vfs.mkdir('/a', { recursive: true })
  })

  test('rm non-empty dir needs recursive', async () => {
    const vfs = await make()
    await vfs.mkdir('/a/b', { recursive: true })
    await vfs.writeFile('/a/b/f', 'x')
    await expect(vfs.rm('/a')).rejects.toMatchObject({ code: 'ENOTEMPTY' })
    await vfs.rm('/a', { recursive: true })
    expect(await vfs.exists('/a')).toBe(false)
    expect(await vfs.exists('/a/b/f')).toBe(false)
  })

  test('watch delivers events under prefix only, and unsubscribes', async () => {
    const vfs = await make()
    await vfs.mkdir('/home')
    await vfs.mkdir('/etc')
    const events: unknown[] = []
    const off = vfs.watch('/home', (e) => events.push(e))
    await vfs.writeFile('/home/f', '1')
    await vfs.writeFile('/etc/g', '1')
    off()
    await vfs.writeFile('/home/h', '1')
    expect(events).toEqual([{ type: 'write', path: '/home/f' }])
  })

  test('reset leaves only root', async () => {
    const vfs = await make()
    await vfs.mkdir('/a/b', { recursive: true })
    await vfs.reset()
    expect(await vfs.readdir('/')).toEqual([])
    expect((await vfs.stat('/')).type).toBe('dir')
  })
}
