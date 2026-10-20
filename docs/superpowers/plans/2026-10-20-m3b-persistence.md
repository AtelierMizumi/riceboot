# M3b — Keep Linux Changes (Overlay, IndexedDB, Reset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Files and changes the user makes inside the Linux VM survive a reload, and a Reset button returns the VM to the packaged image.

**Architecture:** The base image stays read-only and lazily loaded (M3a). Writes the guest makes are captured per 1 MiB block by v86's async disk (`get_state` reports only written blocks), kept in an overlay, and flushed to IndexedDB with a debounce and on `pagehide`. On boot the overlay is restored before the emulator runs. Reset clears the overlay and restarts the VM from the base image.

**Tech Stack:** TypeScript, React 19, v86 0.5.471 (already in M3a), `idb`-free raw IndexedDB calls, fake-indexeddb for unit tests, Vitest, Playwright (chromium + firefox).

**Spec:** `docs/superpowers/specs/2026-10-19-m3-real-linux-design.md` (§3.3 persistence, §4 errors, §5 testing, §6 M3b)

## Global Constraints

- Overlay unit is 256 bytes, v86's native block unit (`DISK_UNIT`, see `docs/research/m3b-disk-state.md`). The 1 MiB disk parts stay the lazy-load unit for the base image.
- IndexedDB database `riceboot-vm`, object store `blocks`, meta key `buildId`.
- Dirty blocks are flushed on a 2 s debounce and on `pagehide`.
- Next boot: base parts from the network or cache; dirty blocks from IndexedDB override them.
- Reset deletes the overlay and reloads the base image.
- Storage quota errors show a banner and keep writes in memory.
- The boot bundle stays ≤ 450 KB gzip; v86 stays lazily loaded (M3a).
- Test-first for every logic task. Never weaken or skip a test.

## Review Focus

1. **IndexedDB unavailable (private window, blocked storage)** → changes live in memory, the banner "changes won't be kept after reload" shows, nothing crashes. Test: Task 3 `falls back to memory and reports it when IndexedDB cannot open`.
2. **Quota exceeded during a flush** → banner shown, data stays in memory, the next flush retries. Test: Task 4 `keeps dirty blocks and reports the error when a save fails`.
3. **Image rebuilt, old overlay still in IndexedDB** → overlay is never applied to a different build; the user is asked before it is discarded. Tests: Task 2 `different build asks before discarding`, Task 7 `refuses to restore an overlay for another build`.
4. **Reset while the VM runs or a flush is pending** → VM stops first, the store is cleared, and no late flush writes the old overlay back. Test: Task 7 `reset cancels a pending flush`.
5. **Tab closed inside the debounce window** → `pagehide` flushes at once, so the last change is not lost. Test: Task 6 `pagehide flushes pending blocks immediately`.

---

## File Structure

```
src/vm/overlay.ts          # BlockOverlay: in-memory dirty blocks keyed by index (pure)
src/vm/overlay.test.ts
src/vm/overlayPolicy.ts    # decide what to do with a stored overlay for a build id (pure)
src/vm/overlayPolicy.test.ts
src/vm/overlayStore.ts     # IndexedDB store, with a memory fallback (I/O behind an interface)
src/vm/overlayStore.test.ts
src/vm/flusher.ts          # debounced save with pagehide flush (timers injected)
src/vm/flusher.test.ts
src/vm/diskState.ts        # adapter: v86 disk get_state/set_state <-> BlockOverlay (format fixed by Task 0)
src/vm/diskState.test.ts
src/vm/VmSession.ts        # modified: autostart false, restore overlay, run(), dirty hook, flush wiring
src/vm/VmSession.test.ts   # modified
src/apps/terminal/Terminal.tsx   # modified: Reset button, banner, overlay restore flow
e2e/persistence.spec.ts
docs/research/m3b-disk-state.md  # Task 0 result (the accessor and the state format)
```

---

### Task 0: Spike — reach the v86 disk and confirm dirty blocks

**Files:**
- Create: `docs/research/m3b-disk-state.md`
- Create (throwaway, deleted at the end of the task): `e2e/probe-disk.spec.ts`

**Interfaces:**
- Consumes: M3a `VmSession` (`src/vm/VmSession.ts`), the built `/vm/` parts.
- Produces: the research note, which fixes two facts for later tasks: (a) how to get the disk object from the emulator instance, (b) the exact shape of `get_state()` output for one written block.

- [ ] **Step 1: Read the v86 disk classes**

Read `node_modules/v86/build/libv86.js` around `block_cache_is_write`. Record in the note: the class name holding `block_cache` (the async file image), the block key format (`a+e` where `a` is the block index), and the byte length of each stored block.

- [ ] **Step 2: Find the accessor from the emulator**

In a Playwright probe, boot the M3a VM (`/vm/`), log in, run `echo hi > /root/probe.txt && sync`, then evaluate in the page: find which property of `window.emu` holds the disk (`Object.keys(emu)`, `emu.bus`, `emu.disk`, `emu.fs9p`, or similar). Record the path that reaches an object with `get_state`.

- [ ] **Step 3: Confirm the state shows the write**

Call `get_state()` on that object. Expected: a non-empty list of `[key, bytes]` pairs. Record the key format and the length of the bytes. Also call `set_state` on a fresh emulator and confirm the block contents match.

- [ ] **Step 4: Write the note and delete the probe**

Write `docs/research/m3b-disk-state.md` with the accessor path, the key format and the block length. Delete `e2e/probe-disk.spec.ts`.

Expected outcome: the note names an accessor and a key format. If `get_state` does not show the write, stop and record the blocker in the ledger; do not guess a workaround.

- [ ] **Step 5: Commit**

```bash
git add docs/research/m3b-disk-state.md
git commit -m "docs(research): how to read and restore v86 disk blocks"
```

### Task 1: BlockOverlay

**Files:**
- Create: `src/vm/overlay.ts`, `src/vm/overlay.test.ts`

**Interfaces:**
- Consumes: nothing (`DISK_UNIT` is defined here).
- Produces:
```ts
export const DISK_UNIT = 256
export class BlockOverlay {
  put(index: number, bytes: Uint8Array): void   // throws if bytes.length !== DISK_UNIT
  get(index: number): Uint8Array | undefined
  dirty(): number[]                              // dirty indices, ascending
  takeDirty(): Map<number, Uint8Array>           // returns and forgets the dirty blocks (for flushing)
  clear(): void
  get size(): number                             // number of blocks held
}
```

- [ ] **Step 1: Write the failing test**

```ts
// overlay.test.ts
import { expect, test } from 'vitest'
import { BlockOverlay, DISK_UNIT } from './overlay'

const block = (v: number) => new Uint8Array(DISK_UNIT).fill(v)

test('stores and returns a block by index, sorted dirty list', () => {
  const o = new BlockOverlay()
  o.put(7, block(1))
  o.put(2, block(2))
  expect(o.get(7)?.[0]).toBe(1)
  expect(o.dirty()).toEqual([2, 7])
  expect(o.size).toBe(2)
})

test('rejects a block that is not exactly DISK_UNIT bytes', () => {
  expect(() => new BlockOverlay().put(0, new Uint8Array(10))).toThrow(/DISK_UNIT/)
})

test('takeDirty returns the dirty blocks and clears their dirty flag but keeps the data', () => {
  const o = new BlockOverlay()
  o.put(3, block(9))
  const taken = o.takeDirty()
  expect([...taken.keys()]).toEqual([3])
  expect(o.dirty()).toEqual([])
  expect(o.get(3)?.[0]).toBe(9)
})

test('clear removes everything', () => {
  const o = new BlockOverlay()
  o.put(1, block(1))
  o.clear()
  expect(o.size).toBe(0)
  expect(o.get(1)).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/overlay.test.ts`
Expected: FAIL with "Cannot find module './overlay'".

- [ ] **Step 3: Implement `BlockOverlay` in `src/vm/overlay.ts`**

Use a `Map<number, Uint8Array>` for data and a `Set<number>` for dirty indices. `put` marks the index dirty. `takeDirty` returns a new map of the dirty blocks and clears only the dirty set.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/overlay.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/vm/overlay.ts src/vm/overlay.test.ts
git commit -m "feat(vm): in-memory block overlay with dirty tracking"
```

### Task 2: Overlay policy for a build id

**Files:**
- Create: `src/vm/overlayPolicy.ts`, `src/vm/overlayPolicy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
export type OverlayAction = 'restore' | 'start-empty' | 'ask-discard'
export function overlayAction(stored: string | null, build: string): OverlayAction
// stored === null            -> 'start-empty'
// stored === build           -> 'restore'
// stored !== build           -> 'ask-discard'
```

- [ ] **Step 1: Write the failing test**

```ts
// overlayPolicy.test.ts
import { expect, test } from 'vitest'
import { overlayAction } from './overlayPolicy'

test('no stored overlay starts empty', () => {
  expect(overlayAction(null, 'b1')).toBe('start-empty')
})

test('same build restores the overlay', () => {
  expect(overlayAction('b1', 'b1')).toBe('restore')
})

test('different build asks before discarding', () => {
  expect(overlayAction('b0', 'b1')).toBe('ask-discard')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/overlayPolicy.test.ts`
Expected: FAIL with "Cannot find module './overlayPolicy'".

- [ ] **Step 3: Implement `overlayAction` as three branches on `stored` and `build`**

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/overlayPolicy.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/vm/overlayPolicy.ts src/vm/overlayPolicy.test.ts
git commit -m "feat(vm): decide what to do with a stored overlay per build"
```

### Task 3: Overlay store with memory fallback

**Files:**
- Create: `src/vm/overlayStore.ts`, `src/vm/overlayStore.test.ts`

**Interfaces:**
- Consumes: `CHUNK` (`src/vm/parts.ts`), `BlockOverlay` (Task 1).
- Produces:
```ts
export interface OverlayStore {
  readonly persistent: boolean                   // false when running on the memory fallback
  storedBuildId(): Promise<string | null>
  load(): Promise<Map<number, Uint8Array>>       // blocks for the stored build
  save(buildId: string, blocks: Map<number, Uint8Array>): Promise<void>   // writes blocks, sets buildId
  clear(): Promise<void>                         // removes all blocks and the buildId
}
export function openOverlayStore(dbName?: string): Promise<OverlayStore>  // default 'riceboot-vm'; falls back to memory on open error
```

- [ ] **Step 1: Write the failing test**

```ts
// overlayStore.test.ts
import 'fake-indexeddb/auto'
import { afterEach, expect, test, vi } from 'vitest'
import { CHUNK } from '../parts'
import { openOverlayStore } from './overlayStore'

const block = (v: number) => new Uint8Array(CHUNK).fill(v)

test('saves blocks with their build id and loads them back', async () => {
  const s = await openOverlayStore('t-roundtrip')
  expect(s.persistent).toBe(true)
  await s.save('b1', new Map([[4, block(7)]]))
  expect(await s.storedBuildId()).toBe('b1')
  const loaded = await s.load()
  expect(loaded.get(4)?.[0]).toBe(7)
})

test('clear removes the blocks and the build id', async () => {
  const s = await openOverlayStore('t-clear')
  await s.save('b1', new Map([[1, block(1)]]))
  await s.clear()
  expect(await s.storedBuildId()).toBeNull()
  expect((await s.load()).size).toBe(0)
})

afterEach(() => vi.restoreAllMocks())

test('falls back to memory and reports it when IndexedDB cannot open', async () => {
  vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError')
  })
  const s = await openOverlayStore('t-blocked')
  expect(s.persistent).toBe(false)
  await s.save('b1', new Map([[2, block(5)]]))
  expect((await s.load()).get(2)?.[0]).toBe(5)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/overlayStore.test.ts`
Expected: FAIL with "Cannot find module './overlayStore'".

- [ ] **Step 3: Implement**

Raw IndexedDB: `indexedDB.open(name, 1)` with `onupgradeneeded` creating object store `blocks` (no keyPath, out-of-line keys as strings `block:<index>`) and storing the build id under key `meta:buildId`. `save` runs one readwrite transaction that puts each block and the build id; `clear` deletes all keys in one transaction. The memory fallback is a `Map` with the same four methods and `persistent: false`. Wrap `indexedDB.open` in try/catch so a synchronous throw takes the fallback path.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/overlayStore.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/vm/overlayStore.ts src/vm/overlayStore.test.ts
git commit -m "feat(vm): IndexedDB overlay store with memory fallback"
```

### Task 4: Debounced flusher

**Files:**
- Create: `src/vm/flusher.ts`, `src/vm/flusher.test.ts`

**Interfaces:**
- Consumes: nothing (timers injected).
- Produces:
```ts
export interface Flusher {
  schedule(): void          // (re)starts the debounce timer
  flushNow(): Promise<void> // saves immediately if anything is pending
  dispose(): void           // cancels the timer; no further saves
}
export function createFlusher(opts: {
  save(): Promise<void>     // the caller takes dirty blocks and saves them; resolves on success
  onError(e: unknown): void
  delayMs?: number          // default 2000
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}): Flusher
```

- [ ] **Step 1: Write the failing test**

```ts
// flusher.test.ts
import { beforeEach, expect, test, vi } from 'vitest'
import { createFlusher } from './flusher'

beforeEach(() => vi.useFakeTimers())

test('many schedule calls produce one save after the delay', async () => {
  const save = vi.fn(async () => {})
  const f = createFlusher({ save, onError: vi.fn() })
  f.schedule(); f.schedule(); f.schedule()
  vi.advanceTimersByTime(1999)
  expect(save).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  await vi.runAllTimersAsync()
  expect(save).toHaveBeenCalledTimes(1)
})

test('keeps dirty state and reports the error when a save fails', async () => {
  const err = new Error('QuotaExceededError')
  const onError = vi.fn()
  const f = createFlusher({ save: async () => { throw err }, onError })
  f.schedule()
  await f.flushNow()
  expect(onError).toHaveBeenCalledWith(err)
})

test('flushNow saves at once and dispose cancels a pending save', async () => {
  const save = vi.fn(async () => {})
  const f = createFlusher({ save, onError: vi.fn() })
  f.schedule()
  await f.flushNow()
  expect(save).toHaveBeenCalledTimes(1)
  f.schedule()
  f.dispose()
  await vi.runAllTimersAsync()
  expect(save).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/flusher.test.ts`
Expected: FAIL with "Cannot find module './flusher'".

- [ ] **Step 3: Implement `createFlusher`**

`schedule` clears the pending timer and sets a new one for `delayMs`. `flushNow` clears the timer and calls `save`; on rejection it calls `onError`. `dispose` clears the timer and sets a `disposed` flag so `schedule` and `flushNow` do nothing afterwards.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/flusher.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/vm/flusher.ts src/vm/flusher.test.ts
git commit -m "feat(vm): debounced flusher with immediate flush"
```

### Task 5: Disk state adapter

**Files:**
- Create: `src/vm/diskState.ts`, `src/vm/diskState.test.ts`

**Interfaces:**
- Consumes: `DISK_UNIT` and `BlockOverlay` (Task 1), and the format fixed in `docs/research/m3b-disk-state.md` (Task 0): entries are `[key, Uint8Array(256)]`.
- Produces:
```ts
export interface V86DiskLike {
  get_state(): unknown
  set_state(state: unknown): void
}
export function captureDirty(disk: V86DiskLike, overlay: BlockOverlay): void   // reads get_state, puts each written block into the overlay
export function restoreBlocks(disk: V86DiskLike, blocks: Map<number, Uint8Array>): void  // builds the state and calls set_state
```

The exact `get_state` shape is the one recorded in Task 0. The test below uses that shape; if Task 0 found a different shape, update the fixture to match the note, not the other way round.

- [ ] **Step 1: Write the failing test**

```ts
// diskState.test.ts
import { expect, test, vi } from 'vitest'
import { BlockOverlay } from './overlay'
import { captureDirty, restoreBlocks, type V86DiskLike } from './diskState'

const block = (v: number) => new Uint8Array(256).fill(v)

test('captureDirty copies only the blocks the guest wrote into the overlay', () => {
  const disk: V86DiskLike = { get_state: () => [[[5, block(3)]], ], set_state: vi.fn() }
  const overlay = new BlockOverlay()
  captureDirty(disk, overlay)
  expect(overlay.dirty()).toEqual([5])
  expect(overlay.get(5)?.[0]).toBe(3)
})

test('restoreBlocks hands the blocks back through set_state', () => {
  const set = vi.fn()
  restoreBlocks({ get_state: () => null, set_state: set }, new Map([[9, block(4)]]))
  expect(set).toHaveBeenCalledTimes(1)
  expect(set.mock.calls[0][0][0][0][0]).toBe(9)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/diskState.test.ts`
Expected: FAIL with "Cannot find module './diskState'".

- [ ] **Step 3: Implement the two functions**

Adjust the parsing to the shape in `docs/research/m3b-disk-state.md`. Key decoding is one line in that note. Keep the block index as a number.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/diskState.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/vm/diskState.ts src/vm/diskState.test.ts
git commit -m "feat(vm): adapter between v86 disk state and the block overlay"
```

### Task 6: VmSession restores, captures and flushes

**Files:**
- Modify: `src/vm/VmSession.ts`, `src/vm/VmSession.test.ts`

**Interfaces:**
- Consumes: `BlockOverlay` (Task 1), `OverlayStore` (Task 3), `createFlusher` (Task 4), `captureDirty` and `restoreBlocks` (Task 5), and the M3a VmSession.
- Produces: `VmSessionOptions` gains `overlay?: { store: OverlayStore; buildId: string; blocks: Map<number, Uint8Array> }`. `VmSession` gains a `disk` getter used internally; behaviour:
  - `start()` creates the emulator with `autostart: false`, restores `blocks` into the disk when provided, then calls `emu.run()`.
  - Every `pagehide` and every guest write (v86 `disk-write` hook: confirm the event name in Task 0's note, else poll `get_state` on the flusher's schedule) calls `captureDirty` then `flusher.schedule()`.
  - `stop()` calls `flusher.flushNow()` before tearing down, then `flusher.dispose()`.

- [ ] **Step 1: Write the failing test**

Add to `VmSession.test.ts` (the fake emulator gains `run`, `disk` with `get_state`/`set_state`, and records `options.autostart`):

```ts
test('start creates the emulator without autostart, restores blocks, then runs it', async () => {
  const restored: unknown[] = []
  const e = fakeEmu()
  e.disk = { get_state: () => [], set_state: (s: unknown) => restored.push(s) }
  e.run = vi.fn()
  const createSpy = vi.fn(() => e)
  const s = new VmSession({ baseUrl: '/vm/', manifest, overlay: fakeOverlay([[4, new Uint8Array(1048576)]]) }, handlers, { load: async () => {}, create: createSpy as never })
  await s.start()
  expect(createSpy.mock.calls[0][0]).toMatchObject({ autostart: false })
  expect(restored).toHaveLength(1)
  expect(e.run).toHaveBeenCalledTimes(1)
})

test('stop flushes pending blocks before it tears down', async () => {
  const saved = vi.fn(async () => {})
  const e = fakeEmu()
  e.disk = { get_state: () => [[[2, new Uint8Array(1048576)]]], set_state: vi.fn() }
  e.run = vi.fn()
  const s = new VmSession({ baseUrl: '/vm/', manifest, overlay: fakeOverlay([], saved) }, handlers, { load: async () => {}, create: (() => e) as never })
  await s.start()
  s.stop()
  await vi.runAllTimersAsync()
  expect(saved).toHaveBeenCalledTimes(1)
})
```

`fakeOverlay(entries, saved?)` is a test helper in the same file that returns `{ store: { persistent: true, storedBuildId: async () => 'b1', load: async () => new Map(entries), save: saved ?? (async () => {}), clear: async () => {} }, buildId: 'b1', blocks: new Map(entries) }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/VmSession.test.ts`
Expected: FAIL, the new options and `run` calls are not implemented.

- [ ] **Step 3: Implement the wiring in `VmSession.ts`**

Use `overlay.blocks` for restore and an internal `BlockOverlay` for capture. The `flusher` `save` callback is `() => { captureDirty(disk, overlay); return store.save(buildId, overlay.takeDirty()) }`. Hook `pagehide` on `window` in `start()` and remove it in `stop()`. Keep M3a's watchdog and listeners unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/VmSession.test.ts`
Expected: PASS, all M3a session tests plus the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/vm/VmSession.ts src/vm/VmSession.test.ts
git commit -m "feat(vm): restore the overlay before boot and flush it on stop"
```

### Task 6b: Writable package disk with a home directory

**Why:** Task 0 showed that `/root` lives on the ISO's tmpfs and is lost on reload. User data must sit on hda, which M3a mounts read-only.

**Files:**
- Modify: `src/vm/bootstrap.ts`, `src/vm/bootstrap.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PACKAGE_BOOTSTRAP` mounts `/dev/sda` read-write at `/mnt/rice`, creates `/mnt/rice/root`, and binds it over `/root`. The package binds and PATH from M3a stay.

- [ ] **Step 1: Write the failing test** (extend `bootstrap.test.ts`)

```ts
test('bootstrap mounts the package disk read-write and binds a home directory over /root', () => {
  expect(PACKAGE_BOOTSTRAP).toContain('mount -t ext2 -o rw /dev/sda /mnt/rice')
  expect(PACKAGE_BOOTSTRAP).toContain('mount --bind /mnt/rice/root /root')
  expect(PACKAGE_BOOTSTRAP).not.toContain('-o ro /dev/sda')
})
```

- [ ] **Step 2: Run to verify it fails**: `pnpm vitest run src/vm/bootstrap.test.ts` → FAIL (still read-only).

- [ ] **Step 3: Implement**: change the mount to `-o rw`, add `mkdir -p /mnt/rice/root && mount --bind /mnt/rice/root /root` after the mount.

- [ ] **Step 4: Run to verify it passes**: `pnpm vitest run src/vm/bootstrap.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/bootstrap.ts src/vm/bootstrap.test.ts
git commit -m "feat(vm): writable package disk with a home directory for /root"
```

### Task 7: Terminal flow, Reset, and banner

**Files:**
- Modify: `src/apps/terminal/Terminal.tsx`, `src/apps/terminal/Terminal.css`
- Create: `src/vm/resetPolicy.ts`, `src/vm/resetPolicy.test.ts`

**Interfaces:**
- Consumes: `openOverlayStore` (Task 3), `overlayAction` (Task 2), `VmSession` overlay options (Task 6), `createRunGuard` (M3a).
- Produces:
  - `resetPolicy.ts`: `export function shouldRestartAfterReset(mode: 'shell' | 'loading' | 'linux' | 'error'): boolean` — true for `loading`, `linux` and `error`, false for `shell`. Reset while in shell mode only clears the overlay.
  - Terminal: a `reset` button in the toolbar, visible in `linux` and `error`; a banner line when `store.persistent` is false.

- [ ] **Step 1: Write the failing test**

```ts
// resetPolicy.test.ts
import { expect, test } from 'vitest'
import { shouldRestartAfterReset } from './resetPolicy'

test('reset restarts the VM only when it is running or loading or failed', () => {
  expect(shouldRestartAfterReset('linux')).toBe(true)
  expect(shouldRestartAfterReset('loading')).toBe(true)
  expect(shouldRestartAfterReset('error')).toBe(true)
  expect(shouldRestartAfterReset('shell')).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/resetPolicy.test.ts`
Expected: FAIL with "Cannot find module './resetPolicy'".

- [ ] **Step 3: Implement `shouldRestartAfterReset` and the Terminal flow**

Terminal `start-vm` now: open the store once per terminal; read `storedBuildId()`; `overlayAction(stored, manifest.buildId)`:
- `restore`: `load()` blocks and pass them in the overlay option.
- `start-empty`: pass an empty overlay.
- `ask-discard`: `window.confirm('Linux changes were made with an older image. Discard them?')`. If yes, `clear()` and start empty; if no, start with the current overlay refused: show the message and stay in shell mode (dispatch `failed` with reason `kept older overlay`).

Reset button: `guard.cancelAll()`; `session?.stop()` (this flushes; then `store.clear()`); clear the in-memory overlay; if `shouldRestartAfterReset(mode)` dispatch `request-linux` again. The flush from `stop()` must finish before `clear()` runs: `await` the flush by having `stop()` return the flush promise, or chain `clear()` after it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/resetPolicy.test.ts && pnpm exec tsc --noEmit -p .`
Expected: PASS, 1 test, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/vm/resetPolicy.ts src/vm/resetPolicy.test.ts src/apps/terminal/Terminal.tsx src/apps/terminal/Terminal.css
git commit -m "feat(terminal): restore saved Linux changes, reset and banner"
```

### Task 8: End-to-end persistence test

**Files:**
- Create: `e2e/persistence.spec.ts`

**Interfaces:**
- Consumes: the whole M3b flow and the `linux` mode from M3a.
- Produces: a Playwright test that proves changes survive a reload and Reset clears them.

- [ ] **Step 1: Write the failing test**

```ts
// e2e/persistence.spec.ts
import { expect, test, type Page } from '@playwright/test'

async function bootLinux(page: Page) {
  await page.getByTestId('desktop').waitFor()
  await page.keyboard.press('Alt+Enter')
  const term = page.getByTestId('window-terminal').last()
  await page.getByRole('button', { name: 'linux' }).click()
  await expect(term).toContainText('login:', { timeout: 300_000 })
  await page.keyboard.type('root')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('riceboot: packages ready', { timeout: 60_000 })
  return term
}

test('a file written in linux survives a reload, and reset removes it', async ({ page }) => {
  test.setTimeout(900_000)
  await page.goto('/')
  await bootLinux(page)
  await page.keyboard.type('echo persisted-yes > /root/keep.txt && sync')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(3000)

  await page.reload()
  const term = await bootLinux(page)
  await page.keyboard.type('cat /root/keep.txt')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('persisted-yes', { timeout: 60_000 })

  await page.getByRole('button', { name: 'reset' }).click()
  await page.getByRole('button', { name: 'linux' }).click()
  await expect(term).toContainText('login:', { timeout: 300_000 })
  await page.keyboard.type('root')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('riceboot: packages ready', { timeout: 60_000 })
  await page.keyboard.type('cat /root/keep.txt; echo gone-$?')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('gone-1', { timeout: 60_000 })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm build && pnpm test:e2e e2e/persistence.spec.ts --project=chromium`
Expected: FAIL, the file is gone after the reload (no persistence yet) or the reset button is missing.

- [ ] **Step 3: Confirm the failure is the missing feature**

Read the failure text. It must mention the missing `persisted-yes` or the missing `reset` button, not a crash in the harness.

- [ ] **Step 4: Run it after Tasks 0 to 7 are done**

Run: `pnpm build && pnpm test:e2e e2e/persistence.spec.ts`
Expected: PASS on chromium and firefox.

- [ ] **Step 5: Commit**

```bash
git add e2e/persistence.spec.ts
git commit -m "test(e2e): linux changes persist across reload and reset clears them"
```

---

## Self-review notes

- Spec §3.3 (overlay, IndexedDB, flush, reset, quota banner) → Tasks 1, 3, 4, 6, 7. §4 errors → Review Focus 1–3. §5 testing → Tasks 1–8 and Task 8 e2e. §6 M3b → this plan.
- Task 0 is a spike. Its result fixes the accessor and state shape used in Tasks 5 and 6. If Task 0 cannot read the written blocks, the plan stops at Task 0 and the blocker is reported; no workaround is planned.
- The 2 s debounce, 1 MiB block size and database names come from the spec and Global Constraints.
- Out of scope for M3b: the package set (M3c), guest networking, and per-user accounts.
