import { expect, test } from 'vitest'
import { PACKAGE_BOOTSTRAP } from './bootstrap'

test('bootstrap mounts the read-only package disk and binds only lib, usr/lib and usr/share', () => {
  expect(PACKAGE_BOOTSTRAP).toContain('mount -t ext2 -o ro /dev/sda /mnt/rice')
  expect(PACKAGE_BOOTSTRAP).toContain('mount --bind /mnt/rice/lib /lib')
  expect(PACKAGE_BOOTSTRAP).toContain('mount --bind /mnt/rice/usr/lib /usr/lib')
  expect(PACKAGE_BOOTSTRAP).toContain('mount --bind /mnt/rice/usr/share /usr/share')
  expect(PACKAGE_BOOTSTRAP).toContain('export PATH=/mnt/rice/usr/bin:$PATH')
  expect(PACKAGE_BOOTSTRAP).not.toContain('mount --bind /mnt/rice/usr /usr')
  expect(PACKAGE_BOOTSTRAP).toMatch(/echo "riceboot: packa""ges ready"\n$/)
})
