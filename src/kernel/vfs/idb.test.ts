import { expect, test } from 'vitest'
import { createIdbVfs } from './idb'
import { runVfsContract } from './vfsContract'

let n = 0
runVfsContract(() => createIdbVfs(`contract-${n++}`))

test('idb vfs is persistent and data survives a new instance', async () => {
  const a = await createIdbVfs('t1')
  expect(a.persistent).toBe(true)
  await a.mkdir('/home/user', { recursive: true })
  await a.writeFile('/home/user/note', 'kept')
  const b = await createIdbVfs('t1')
  expect(await b.readFile('/home/user/note')).toBe('kept')
  expect(await b.readdir('/home')).toEqual(['user'])
})

test('rm and reset are persisted', async () => {
  const a = await createIdbVfs('t2')
  await a.mkdir('/x/y', { recursive: true })
  await a.rm('/x', { recursive: true })
  await a.writeFile('/keep', '1')
  expect(await (await createIdbVfs('t2')).exists('/x/y')).toBe(false)
  await a.reset()
  expect(await (await createIdbVfs('t2')).readdir('/')).toEqual([])
})
