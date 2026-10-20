/**
 * Sent to the guest shell once it is ready. The packages live on the second disk (hda, /dev/sda), which the ISO
 * root does not know about. Only lib, usr/lib and usr/share are bound over the guest's own (binding all of /usr
 * would hide the busybox applets in the ISO root), and the package binaries go first on PATH. Both come from the
 * same Alpine release, so the musl loader matches. The ready message is split in the
 * command line so the echoed command never matches the output the tests wait for.
 */
export const PACKAGE_BOOTSTRAP =
  'mkdir -p /mnt/rice && mount -t ext2 -o ro /dev/sda /mnt/rice && mount --bind /mnt/rice/lib /lib && mount --bind /mnt/rice/usr/lib /usr/lib && mount --bind /mnt/rice/usr/share /usr/share && export PATH=/mnt/rice/usr/bin:$PATH && echo "riceboot: packa""ges ready"\n'
