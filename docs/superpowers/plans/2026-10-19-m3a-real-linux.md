# M3a — Read-only Real Linux in the Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Terminal app gets a `linux` mode that boots Alpine x86 in v86 with a read-only, lazily loaded disk holding python3, neovim, git and fastfetch; the default `shell` mode is unchanged.

**Architecture:** A Node build script (`tools/build-image/`) resolves the package closure, extracts packages, builds an ext2 image and splits the disk and ISO into 1 MiB parts under `public/vm/`. The app loads v86 only when the user picks `linux`, boots it with async `use_parts` disks, and wires its serial port to xterm. Mode switching is a pure state machine.

**Tech Stack:** Node 24 + TypeScript (build script), `e2fsprogs` (`mke2fs -d`), `tar`, v86 0.5.471 (runtime, loaded on demand), React 19, xterm.js, Vitest, Playwright (chromium + firefox).

**Spec:** `docs/superpowers/specs/2026-10-19-m3-real-linux-design.md`

## Global Constraints

- Boot bundle ≤ 450 KB gzip (existing `size-limit` check, unchanged).
- v86 runtime (`libv86.js`, `v86.wasm`) is loaded only when the user selects `linux`; never imported by the boot bundle.
- Every file under `public/vm/` is ≤ 25 MiB; disk and ISO parts are exactly 1 MiB (`CHUNK = 1048576`).
- Guest has no network device (`net_device` omitted).
- Image size is 128 MiB (ruling against spec §7's 256 MiB; total `public/vm/` ≈ 192 MiB, within the 300 MB budget).
- ISO is zero-padded to a multiple of 1 MiB (64 MiB) so every part is full size.
- Packages (M3a): `python3`, `neovim`, `git`, `fastfetch` plus their closure, Alpine v3.24, x86.
- Test-first: every logic task writes its failing test first and runs it red.
- Code, comments and commits in English.

## Review Focus

1. **WebAssembly or memory unavailable** → `linux` is refused with a message; shell mode keeps working. Test: Task 6 `refuses linux when the runtime is unsupported`.
2. **A part fails to load during boot** → state moves to `error`, the user gets a retry, nothing hangs. Test: Task 6 `failed boot moves to error and can retry`.
3. **Leaving `linux` while the VM runs** → VM is stopped and output stops reaching xterm. Test: Task 6 `leaving linux stops the VM`.
4. **Terminal resized in `linux` mode** → the guest learns the new size, or output wraps wrong. Test: Task 7 `resize sends stty to the guest`.
5. **Build output drifts between runs** → same inputs give same file names and sizes, or the parts no longer match the manifest. Test: Task 3 `manifest lists every part and totals match`.

---

## File Structure

```
tools/build-image/
  resolve.ts            # APKINDEX parsing + dependency closure (pure)
  resolve.test.ts
  packages.txt          # M3a package list
  build.ts              # download, extract, mke2fs, split, manifest (I/O)
  manifest.ts           # manifest + totals from parts (pure)
  manifest.test.ts
src/vm/
  parts.ts              # CHUNK, partName, splitParts (pure, shared by build and app)
  parts.test.ts
  options.ts            # VmManifest type, buildV86Options (pure)
  options.test.ts
  runtime.ts            # isVmSupported, loadRuntime (browser)
  terminalMode.ts       # mode state machine (pure)
  terminalMode.test.ts
  resize.ts             # sttyCommand (pure)
  resize.test.ts
  VmSession.ts          # wraps V86 instance: start, input, output, stop
src/apps/terminal/Terminal.tsx   # modified: mode toggle, linux attach
e2e/linux.spec.ts
scripts/copy-runtime.mjs         # copies libv86.js and v86.wasm into public/vm/runtime/
```

---

### Task 1: Package closure resolver

**Files:**
- Create: `tools/build-image/resolve.ts`, `tools/build-image/resolve.test.ts`, `tools/build-image/packages.txt`
- Test: `tools/build-image/resolve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
export interface PkgRecord { name: string; version: string; repo: 'main' | 'community'; depends: string[]; provides: string[] }
export function parseApkIndex(text: string, repo: 'main' | 'community'): PkgRecord[]
export function resolveClosure(all: PkgRecord[], targets: string[]): PkgRecord[]   // sorted by name
```
`depends` holds raw `D:` tokens (e.g. `so:libc.musl-x86.so.1`, `hwdata-pci`, `cmd:x`). `provides` holds the names from `p:` (e.g. `cmd:fastfetch=2.64.2-r0`, version suffix stripped).

- [ ] **Step 1: Write the failing test**

```ts
// resolve.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tools/build-image/resolve.test.ts`
Expected: FAIL with "Cannot find module './resolve'".

- [ ] **Step 3: Implement `parseApkIndex` and `resolveClosure` in `tools/build-image/resolve.ts`**

Split the index on blank lines; read `P:`, `V:`, `D:`, `p:`. Strip `=version` and `<>~` suffixes from `D:` and `p:` tokens when matching names. Resolve a `so:`/`cmd:` dependency through `provides`. Walk depth-first with a `seen` set. `resolveClosure` throws `Error('unknown package: <name>')` for a target with no record.

- [ ] **Step 4: Create `tools/build-image/packages.txt`**

```
python3
neovim
git
fastfetch
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tools/build-image/resolve.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add tools/build-image/resolve.ts tools/build-image/resolve.test.ts tools/build-image/packages.txt
git commit -m "feat(build-image): apk index parser and dependency closure"
```

### Task 2: Part naming and splitting

**Files:**
- Create: `src/vm/parts.ts`, `src/vm/parts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
export const CHUNK = 1048576
export function partName(base: string, ext: string, offset: number): string   // `${base}-${offset}-${offset + CHUNK}${ext}`
export function splitParts(data: Uint8Array, base: string, ext: string, padTo?: number): { name: string; bytes: Uint8Array }[]
```

- [ ] **Step 1: Write the failing test**

```ts
// parts.test.ts
import { expect, test } from 'vitest'
import { CHUNK, partName, splitParts } from './parts'

test('partName follows the v86 use_parts scheme', () => {
  expect(CHUNK).toBe(1048576)
  expect(partName('rice', '.img', 0)).toBe('rice-0-1048576.img')
  expect(partName('rice', '.img', 3 * CHUNK)).toBe('rice-3145728-4194304.img')
})

test('splitParts yields full 1 MiB parts and pads the last one', () => {
  const parts = splitParts(new Uint8Array(CHUNK + 5), 'x', '.img')
  expect(parts.map((p) => p.name)).toEqual(['x-0-1048576.img', 'x-1048576-2097152.img'])
  expect(parts[1].bytes.length).toBe(CHUNK)
  expect(parts[1].bytes[4]).toBe(0)
})

test('padTo extends the data with zeros before splitting', () => {
  const parts = splitParts(new Uint8Array(10), 'a', '.iso', 2 * CHUNK)
  expect(parts.length).toBe(2)
  expect(parts[1].bytes.every((b) => b === 0)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/parts.test.ts`
Expected: FAIL with "Cannot find module './parts'".

- [ ] **Step 3: Implement in `src/vm/parts.ts`**

`partName` is a template string. `splitParts` copies `data` into a buffer of length `max(data.length, padTo ?? 0)` rounded up to a multiple of `CHUNK`, then slices it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/parts.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/vm/parts.ts src/vm/parts.test.ts
git commit -m "feat(vm): part naming and splitting for lazy disks"
```

### Task 3: Manifest

**Files:**
- Create: `tools/build-image/manifest.ts`, `tools/build-image/manifest.test.ts`
- Create: `src/vm/options.ts` (type only in this task; the builder comes in Task 5)

**Interfaces:**
- Consumes: `CHUNK`, `partName` (Task 2).
- Produces:
```ts
// src/vm/options.ts
export interface VmDisk { base: string; ext: string; size: number }   // size in bytes, multiple of CHUNK
export interface VmManifest { buildId: string; cdrom: VmDisk; hda: VmDisk; packages: string[] }
// tools/build-image/manifest.ts
export function buildManifest(args: { buildId: string; cdrom: VmDisk; hda: VmDisk; packages: string[] }): VmManifest
export function listParts(d: VmDisk): string[]   // every part file name, in order
export function totalBytes(m: VmManifest): number   // sum of all disk sizes plus runtime files (libv86.js, v86.wasm sizes passed in as 0 for the test)
```

- [ ] **Step 1: Write the failing test**

```ts
// tools/build-image/manifest.test.ts
import { expect, test } from 'vitest'
import { CHUNK } from '../../src/vm/parts'
import { buildManifest, listParts, totalBytes } from './manifest'

const cdrom = { base: 'alpine', ext: '.iso', size: 4 * CHUNK }
const hda = { base: 'rice', ext: '.img', size: 128 * CHUNK }

test('manifest lists every part and totals match', () => {
  const m = buildManifest({ buildId: 'b1', cdrom, hda, packages: ['fastfetch'] })
  expect(listParts(m.hda)).toHaveLength(128)
  expect(listParts(m.cdrom)).toHaveLength(4)
  expect(listParts(m.hda)[0]).toBe('rice-0-1048576.img')
  expect(totalBytes(m)).toBe((4 + 128) * CHUNK)
})

test('a disk size that is not a multiple of CHUNK is rejected', () => {
  expect(() => buildManifest({ buildId: 'b', cdrom, hda: { base: 'rice', ext: '.img', size: CHUNK + 1 }, packages: [] })).toThrow(/multiple/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tools/build-image/manifest.test.ts`
Expected: FAIL with "Cannot find module './manifest'".

- [ ] **Step 3: Implement**

Create the `src/vm/options.ts` types exactly as in the Interfaces block. `buildManifest` throws `Error('disk size must be a multiple of CHUNK')` when `size % CHUNK !== 0`. `listParts` maps offsets `0, CHUNK, …` through `partName`. `totalBytes` sums `size` of both disks (runtime files are added by the build script in Task 4).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tools/build-image/manifest.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/build-image/manifest.ts tools/build-image/manifest.test.ts src/vm/options.ts
git commit -m "feat(build-image): manifest of disk parts with size checks"
```

### Task 4: Image build script

**Files:**
- Create: `tools/build-image/build.ts`, `scripts/copy-runtime.mjs`
- Modify: `package.json` (scripts `vm:build`, `vm:runtime`; `build` runs `vm:runtime` first)

**Interfaces:**
- Consumes: `resolveClosure`, `parseApkIndex` (Task 1), `splitParts` and `CHUNK` (Task 2), `buildManifest` (Task 3).
- Produces: `public/vm/` containing `alpine-<o>-<o+CHUNK>.iso`, `rice-<o>-<o+CHUNK>.img`, `manifest.json`, and `public/vm/runtime/libv86.js`, `public/vm/runtime/v86.wasm`. Cache in `.cache/vm/` (git-ignored).

- [ ] **Step 1: Write the failing check** (this is a build script; the test is an output check, run after implementation)

Add to `tools/build-image/build.test.ts`:
```ts
import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '../../public/vm')

test('build output exists and the manifest matches the files on disk', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  for (const d of [m.cdrom, m.hda]) {
    for (let o = 0; o < d.size; o += 1048576) {
      expect(existsSync(join(root, `${d.base}-${o}-${o + 1048576}${d.ext}`))).toBe(true)
    }
  }
  expect(existsSync(join(root, 'runtime/libv86.js'))).toBe(true)
  expect(existsSync(join(root, 'runtime/v86.wasm'))).toBe(true)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tools/build-image/build.test.ts`
Expected: FAIL with ENOENT for `public/vm/manifest.json`.

- [ ] **Step 3: Implement `tools/build-image/build.ts`**

Steps, in order:
1. Download `main-APKINDEX.tar.gz` and `community-APKINDEX.tar.gz` from `https://dl-cdn.alpinelinux.org/alpine/v3.24/<repo>/x86/` into `.cache/vm/`; extract `APKINDEX`; parse with `parseApkIndex`.
2. Read `tools/build-image/packages.txt`; `resolveClosure`.
3. Download each `<name>-<version>.apk` from its repo into `.cache/vm/pkgs/` (skip when already present). Extract each with `tar -xzf` into `.cache/vm/root/`, ignoring the leading `.` metadata files.
4. Build `.cache/vm/rice.img` with `mke2fs -q -t ext2 -F -d .cache/vm/root .cache/vm/rice.img 128M`.
5. Download the Alpine virt ISO `alpine-virt-3.24.2-x86.iso` from the same release (`releases/x86/`) into `.cache/vm/`. Read the bytes; `splitParts(bytes, 'alpine', '.iso', 64 * 1024 * 1024)`.
6. `splitParts` the image bytes with `('rice', '.img')`.
7. Write each part to `public/vm/`. Write `manifest.json` from `buildManifest` with `buildId` = SHA-256 of the sorted package list plus the image size, first 12 hex characters.
8. Copy `.cache/vm/` nothing else; never write outside `public/vm/`.

`scripts/copy-runtime.mjs`: copy `node_modules/v86/build/libv86.js` and `v86.wasm` to `public/vm/runtime/`, creating the folder.

- [ ] **Step 4: Run the build and the check**

Run: `pnpm vm:runtime && pnpm vm:build && pnpm vitest run tools/build-image/build.test.ts`
Expected: PASS. Then `ls public/vm | wc -l` prints 326 (320 parts, `manifest.json`, `runtime/`), and `du -sh public/vm` ≤ 200M.

- [ ] **Step 5: Commit**

```bash
git add tools/build-image/build.ts tools/build-image/build.test.ts scripts/copy-runtime.mjs package.json .gitignore
git commit -m "feat(build-image): build the read-only Alpine disk and ISO parts"
```

### Task 5: v86 options builder

**Files:**
- Modify: `src/vm/options.ts`
- Create: `src/vm/options.test.ts`

**Interfaces:**
- Consumes: `VmManifest`, `VmDisk` (Task 3), `CHUNK` (Task 2).
- Produces:
```ts
export interface V86Options { /* subset actually passed to new V86 */ }
export function buildV86Options(args: { baseUrl: string; manifest: VmManifest; memoryMiB?: number; wasmPath: string }): V86Options
```

- [ ] **Step 1: Write the failing test**

```ts
// options.test.ts
import { expect, test } from 'vitest'
import { CHUNK } from './parts'
import { buildV86Options } from './options'

const manifest = {
  buildId: 'b1',
  cdrom: { base: 'alpine', ext: '.iso', size: 64 * 1024 * 1024 },
  hda: { base: 'rice', ext: '.img', size: 128 * CHUNK },
  packages: [],
}

test('disks are async parts with fixed 1 MiB chunks and no network device', () => {
  const o = buildV86Options({ baseUrl: '/vm/', manifest, wasmPath: '/vm/runtime/v86.wasm' }) as any
  expect(o.cdrom).toEqual({ url: '/vm/alpine.iso', async: true, size: 64 * 1024 * 1024, use_parts: true, fixed_chunk_size: CHUNK })
  expect(o.hda).toMatchObject({ async: true, use_parts: true, fixed_chunk_size: CHUNK, size: 128 * CHUNK })
  expect(o.net_device).toBeUndefined()
  expect(o.memory_size).toBe(256 * 1024 * 1024)
  expect(o.autostart).toBe(true)
})
```

Note for the implementer: for parts disks, v86 derives the basename and extension from `url` (the part suffix is added by v86). `url` is therefore `baseUrl + base + ext`, which is what the test pins.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/options.test.ts`
Expected: FAIL with "buildV86Options is not a function".

- [ ] **Step 3: Implement**

`url` = `baseUrl + base + ext` for each disk. `memory_size` = `memoryMiB * 1024 * 1024` with `memoryMiB` default 256. `autostart: true`, `wasm_path: wasmPath`, `bios: { url: baseUrl + 'runtime/seabios.bin' }` and `vga_bios: { url: baseUrl + 'runtime/vgabios.bin' }` (copy both in Task 4 as well; add them to `copy-runtime.mjs` now).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/options.ts src/vm/options.test.ts scripts/copy-runtime.mjs
git commit -m "feat(vm): v86 options for read-only lazy disks"
```

### Task 6: Terminal mode state machine

**Files:**
- Create: `src/vm/terminalMode.ts`, `src/vm/terminalMode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
export type Mode = 'shell' | 'loading' | 'linux' | 'error'
export type ModeEvent =
  | { type: 'request-linux'; supported: boolean }
  | { type: 'booted' }
  | { type: 'failed'; reason: string }
  | { type: 'retry'; supported: boolean }
  | { type: 'leave' }
export type Effect = 'start-vm' | 'stop-vm' | 'show-unsupported'
export interface ModeState { mode: Mode; reason?: string }
export function nextMode(s: ModeState, e: ModeEvent): { state: ModeState; effects: Effect[] }
```

- [ ] **Step 1: Write the failing test**

```ts
// terminalMode.test.ts
import { expect, test } from 'vitest'
import { nextMode } from './terminalMode'

const shell = { mode: 'shell' as const }

test('refuses linux when the runtime is unsupported', () => {
  const r = nextMode(shell, { type: 'request-linux', supported: false })
  expect(r.state.mode).toBe('shell')
  expect(r.effects).toEqual(['show-unsupported'])
})

test('request-linux loads the VM and boot completes to linux', () => {
  const loading = nextMode(shell, { type: 'request-linux', supported: true })
  expect(loading.state.mode).toBe('loading')
  expect(loading.effects).toEqual(['start-vm'])
  expect(nextMode(loading.state, { type: 'booted' }).state.mode).toBe('linux')
})

test('failed boot moves to error and can retry', () => {
  const failed = nextMode({ mode: 'loading' }, { type: 'failed', reason: 'part 12 missing' })
  expect(failed.state).toEqual({ mode: 'error', reason: 'part 12 missing' })
  const again = nextMode(failed.state, { type: 'retry', supported: true })
  expect(again.state.mode).toBe('loading')
  expect(again.effects).toEqual(['start-vm'])
})

test('leaving linux stops the VM', () => {
  const r = nextMode({ mode: 'linux' }, { type: 'leave' })
  expect(r.state.mode).toBe('shell')
  expect(r.effects).toEqual(['stop-vm'])
})

test('leaving while loading also stops the VM', () => {
  const r = nextMode({ mode: 'loading' }, { type: 'leave' })
  expect(r.state.mode).toBe('shell')
  expect(r.effects).toEqual(['stop-vm'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vm/terminalMode.test.ts`
Expected: FAIL with "Cannot find module './terminalMode'".

- [ ] **Step 3: Implement `nextMode` as a switch on `e.type` and `s.mode`; any unlisted pair returns the input state with no effects.**

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vm/terminalMode.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/vm/terminalMode.ts src/vm/terminalMode.test.ts
git commit -m "feat(vm): terminal mode state machine"
```

### Task 7: Resize command and runtime support check

**Files:**
- Create: `src/vm/resize.ts`, `src/vm/resize.test.ts`, `src/vm/runtime.ts`, `src/vm/runtime.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
// resize.ts
export function sttyCommand(cols: number, rows: number): string   // "stty cols C rows R\n", C and R clamped to 1..1000
// runtime.ts
export function isVmSupported(g?: { WebAssembly?: unknown }): boolean  // true when WebAssembly is a function-valued object
export function loadRuntime(src: string, doc?: Document): Promise<void> // injects a <script>, resolves on load, rejects on error
```

- [ ] **Step 1: Write the failing tests**

```ts
// resize.test.ts
import { expect, test } from 'vitest'
import { sttyCommand } from './resize'
test('sttyCommand formats and clamps the size', () => {
  expect(sttyCommand(120, 40)).toBe('stty cols 120 rows 40\n')
  expect(sttyCommand(0, 5000)).toBe('stty cols 1 rows 1000\n')
})
```

```ts
// runtime.test.ts
import { expect, test } from 'vitest'
import { isVmSupported } from './runtime'
test('unsupported when WebAssembly is missing', () => {
  expect(isVmSupported({})).toBe(false)
})
test('supported when WebAssembly exists', () => {
  expect(isVmSupported({ WebAssembly: {} })).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/vm/resize.test.ts src/vm/runtime.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement both files**

`sttyCommand`: clamp with `Math.min(1000, Math.max(1, Math.floor(n)))`. `isVmSupported(g = globalThis)`: `typeof g.WebAssembly === 'object' && g.WebAssembly !== null`. `loadRuntime`: create a `script` element with `src`, `onload` resolves, `onerror` rejects with `new Error('failed to load ' + src)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/vm/resize.test.ts src/vm/runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/resize.ts src/vm/resize.test.ts src/vm/runtime.ts src/vm/runtime.test.ts
git commit -m "feat(vm): resize command and runtime support check"
```

### Task 8: VmSession

**Files:**
- Create: `src/vm/VmSession.ts`

**Interfaces:**
- Consumes: `buildV86Options` (Task 5), `loadRuntime` (Task 7), `VmManifest` (Task 3), `sttyCommand` (Task 7).
- Produces:
```ts
export interface VmSessionHandlers { onOutput(text: string): void; onBooted(): void; onFailed(reason: string): void }
export class VmSession {
  constructor(opts: { baseUrl: string; manifest: VmManifest }, handlers: VmSessionHandlers)
  start(): Promise<void>      // loads runtime, creates V86, detects 'login:' and calls onBooted once
  write(text: string): void   // sends input to the serial port
  resize(cols: number, rows: number): void   // writes sttyCommand after boot
  stop(): void                // stops the emulator and removes listeners; idempotent
}
```

This task has no unit test: v86 runs only in a browser, so its behaviour is covered by the Task 9 e2e test. Write the class, then run `pnpm exec tsc --noEmit` and expect no errors.

- [ ] **Step 1: Implement**

`start()`: `await loadRuntime(baseUrl + 'runtime/libv86.js')`, then `new (window as any).V86(buildV86Options({...}))`. Attach `serial0-output-byte` to accumulate chars and call `onOutput`. When the accumulated text first contains `login:`, call `onBooted` once. Catch errors and call `onFailed(message)`. `stop()` calls `emulator.stop()` and `remove_listener` if the emulator exists, then sets `emulator = null`.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/vm/VmSession.ts
git commit -m "feat(vm): session wrapper around the v86 emulator"
```

### Task 9: Terminal integration and e2e

**Files:**
- Modify: `src/apps/terminal/Terminal.tsx`
- Create: `e2e/linux.spec.ts`

**Interfaces:**
- Consumes: `nextMode` (Task 6), `VmSession` (Task 8), `sttyCommand` (Task 7), `isVmSupported` (Task 7), `VmManifest` loaded from `/vm/manifest.json`.
- Produces: a title-bar toggle `shell | linux`, and the existing simulated shell unchanged in `shell` mode.

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/linux.spec.ts
import { expect, test } from '@playwright/test'

test('terminal switches to real linux, runs fastfetch and python3, and back', async ({ page }) => {
  test.setTimeout(480_000)
  await page.goto('/')
  await page.getByTestId('desktop').waitFor()
  await page.keyboard.press('Alt+Enter')
  const term = page.getByTestId('window-terminal').last()
  await page.getByRole('button', { name: 'linux' }).click()
  await expect(term).toContainText('login:', { timeout: 300_000 })
  await page.keyboard.type('root')
  await page.keyboard.press('Enter')
  await page.keyboard.type('fastfetch --pipe -l none | head -1')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('root@localhost', { timeout: 60_000 })
  await page.keyboard.type('python3 -c "print(7*6)"')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('42', { timeout: 60_000 })
  await page.getByRole('button', { name: 'shell' }).click()
  await expect(term).toContainText('riceboot')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:e2e e2e/linux.spec.ts --project=chromium`
Expected: FAIL: the `linux` button does not exist.

- [ ] **Step 3: Implement in `Terminal.tsx`**

- Add a toolbar with two buttons, `shell` and `linux`, using the `nextMode` reducer and `useReducer`.
- On `linux`, dispatch `request-linux` with `supported: isVmSupported()`. On `start-vm`, fetch `/vm/manifest.json`, create `VmSession`, call `start()`, and wire `onOutput` to `term.write`, plus `term.onData` to `session.write` in linux mode.
- On `booted`, call `session.resize` with the xterm `cols` and `rows`, and call `fit` on each window resize.
- On `stop-vm`, call `session.stop()` and detach the xterm data handler. On `show-unsupported`, write `Real Linux needs WebAssembly. Staying in shell mode.` to the terminal.
- In `shell` mode, keep the existing `createShell` flow unchanged.

- [ ] **Step 4: Run e2e on both engines**

Run: `pnpm build && pnpm test:e2e e2e/linux.spec.ts`
Expected: PASS on chromium and firefox.

- [ ] **Step 5: Commit**

```bash
git add src/apps/terminal/Terminal.tsx e2e/linux.spec.ts
git commit -m "feat(terminal): linux mode with real Alpine in the VM"
```

### Task 10: Budget checks

**Files:**
- Modify: `.size-limit.json` (only if the glob needs to include the `vm` runtime, which it must not)

- [ ] **Step 1: Check the boot bundle**

Run: `pnpm size`
Expected: boot bundle ≤ 450 KB gzip, and no `libv86` or `v86.wasm` in the boot chunk (`rg -l libv86 dist/assets` prints nothing).

- [ ] **Step 2: Check the VM folder budget**

Run: `du -sh dist/vm`
Expected: ≤ 200M.

- [ ] **Step 3: Commit only if files changed**

```bash
git status --short
```

Expected: no changes, or only `.size-limit.json` if it was adjusted.

---

## Self-review notes

- Spec §3.1 (image build): Tasks 1, 2, 4. §3.2 (runtime, options): Tasks 5, 7, 8. §3.4 (terminal integration, modes, error messages): Tasks 6, 9. §4 errors: Review Focus 1, 2, 3. §5 e2e: Task 9. §7 budgets: Tasks 4, 10. Spec §3.3 (IndexedDB persistence) and §6 M3b/M3c are out of scope for this plan.
- Deviation from spec §7 (image 256 MiB → 128 MiB) is recorded in Global Constraints.
- Progress bar from real byte counts (spec §3.4) is replaced in M3a by a loading line; recorded here as a ruling for review.
