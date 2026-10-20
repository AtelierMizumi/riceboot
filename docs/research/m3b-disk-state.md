# M3b Task 0 — v86 disk state (research note)

Pinned: `v86@0.5.471` (devDependency). Probed in headless Chromium against the M3a build.

## Accessor
- hda (`/dev/sda`, the packaged image): `emu.v86.cpu.devices.ide.primary.master.buffer`
- cdrom: `emu.v86.cpu.devices.cdrom.buffer`
- `emu.v86` is the emulator internals. It is not in `v86.d.ts`, so the accessor is pinned to this version.

## State format (from `get_state()`)
- Returns `[entries]` where `entries` is `[[key, bytes], ...]`.
- `key` is a 256-byte block index (a number), and `bytes` is a `Uint8Array` of length 256.
- Only blocks written since the disk was attached appear in `entries`. A guest write to a read-write mount produced 32 entries for a small file.
- Consequence: the overlay unit is 256 bytes (v86's native unit), not the 1 MiB disk part. The 1 MiB parts remain the lazy-load unit for the base image.

## Results
- Writes to a read-write mount of hda appear in `get_state()`. Writes to `/root` do not: `/root` lives on the ISO's tmpfs, which is lost on reload.
- Restore works: after `set_state(entries)` on a second emulator created with `autostart: false`, and before `run()`, a file written on the first emulator reads back correctly.
- Serialisation: `Uint8Array` values must be encoded for storage (for example as plain number arrays or base64); `JSON.stringify` alone drops them.

## Required change (for Task 6b)
- The guest must mount hda read-write and bind a directory on it over `/root`, or user data never reaches the disk.
