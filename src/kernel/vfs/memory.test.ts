import { expect, test } from 'vitest'
import { createMemoryVfs } from './memory'
import { runVfsContract } from './vfsContract'

runVfsContract(async () => createMemoryVfs())

test('memory vfs is not persistent', () => {
  expect(createMemoryVfs().persistent).toBe(false)
})
