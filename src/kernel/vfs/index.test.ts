import { afterEach, expect, test, vi } from 'vitest'
import { createVfs, HOME, seedHome } from './index'
import { createMemoryVfs } from './memory'

afterEach(() => vi.restoreAllMocks())

test('falls back to memory when indexedDB.open throws', async () => {
  vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError')
  })
  const vfs = await createVfs()
  expect(vfs.persistent).toBe(false)
  await vfs.writeFile('/a', '1')
  expect(await vfs.readFile('/a')).toBe('1')
})

test('createVfs uses indexeddb when available', async () => {
  expect((await createVfs()).persistent).toBe(true)
})

test('seedHome creates the default tree', async () => {
  const vfs = createMemoryVfs()
  await seedHome(vfs)
  expect(HOME).toBe('/home/user')
  expect(await vfs.readdir(HOME)).toEqual(['.config', 'Documents', 'Downloads', 'Pictures', 'README.txt'])
  expect(await vfs.readFile('/home/user/.config/hypr/hyprland.conf')).toContain('general')
  expect(await vfs.readFile('/etc/os-release')).toContain('ID=arch')
})

test('seedHome is idempotent and keeps user edits', async () => {
  const vfs = createMemoryVfs()
  await seedHome(vfs)
  await vfs.writeFile('/home/user/README.txt', 'mine')
  await seedHome(vfs)
  expect(await vfs.readFile('/home/user/README.txt')).toBe('mine')
})
