# M1 — Shell & Compositor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable riced desktop: fake systemd boot → Hyprland-themed tiling/floating WM with 10 workspaces and keybinds → kitty-like terminal running a fake shell on a persistent IndexedDB VFS.

**Architecture:** Pure-TS `kernel/` (VFS, shell) and pure `compositor/` logic (layout, bezier, keybinds) are unit-tested without DOM. React only mounts components; window geometry and animations are written to DOM through refs by an animation engine, never via React state per frame. The theme is a `ThemePack` object loaded with `import()`.

**Tech Stack:** pnpm, Vite 6, React 19 + `babel-plugin-react-compiler`, TypeScript (strict), zustand, Vitest + jsdom + `fake-indexeddb`, Playwright (chromium + firefox), `@xterm/xterm` + `@xterm/addon-webgl` + `@xterm/addon-fit`, `idb`, size-limit, ESLint, wrangler.

**Spec:** `docs/superpowers/specs/2026-10-18-riceboot-design.md`

## Global Constraints

- Supported browsers: Chromium-based and Firefox-based only. Safari is out of scope.
- Boot bundle ≤ 450 KB gzip (size-limit, enforced in CI).
- Window drag/resize/workspace animations never trigger React re-renders; write `transform`/`opacity` through refs.
- Headers on every response: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`.
- Terminal and its fake shell are lazy chunks (dynamic `import()`), prefetched on idle; not in the boot chunk.
- No backend. Hosting: Cloudflare Workers Static Assets.
- Test-first: every logic task writes the failing test first and runs it red. Never weaken/skip tests.
- Code, comments, commits in English.

## Review Focus

1. **IndexedDB unavailable (Firefox private mode / blocked storage)** → VFS falls back to memory and the desktop still boots with a "changes won't be saved" banner. Test: Task 3 `falls back to memory when indexedDB.open throws`.
2. **Browser-reserved shortcuts (Super, Ctrl+W, Ctrl+T)** → default mod key is `Alt` (configurable), and handled combos call `preventDefault`. Test: Task 6 `uses Alt as default mod` + `prevents default only for bound combos`.
3. **Closing the last window / closing on an empty workspace** → no crash, layout becomes empty. Test: Task 5 `closing the only window leaves an empty layout` and `killactive on empty workspace is a no-op`.
4. **Path edge cases in shell (`cd ..` at `/`, `~`, trailing slashes, nonexistent dir)** → POSIX-like results and `No such file or directory` errors, never exceptions. Test: Task 2 `normalize` cases + Task 8 `cd to missing dir prints error`.
5. **Viewport resize / very small screens** → layout recomputes and windows stay inside the work area (min 1×1, no negative sizes). Test: Task 4 `never yields negative or zero sizes on tiny area`.

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, eslint.config.js, .size-limit.json,
playwright.config.ts, wrangler.jsonc, public/_headers, index.html
src/main.tsx                       # mounts <Boot/> then <Desktop/>
src/kernel/vfs/path.ts             # normalize/join/dirname/basename
src/kernel/vfs/types.ts            # Vfs interface, Stat, VfsError
src/kernel/vfs/memory.ts           # MemoryBackend
src/kernel/vfs/idb.ts              # IdbBackend
src/kernel/vfs/index.ts            # createVfs(), seedHome()
src/compositor/bezier.ts           # cubicBezier()
src/compositor/animator.ts         # Animator (rAF tween to refs)
src/compositor/layout/dwindle.ts   # dwindle()
src/compositor/store.ts            # zustand WM store
src/compositor/keybinds.ts         # parseCombo, createDispatcher
src/compositor/Window.tsx          # window frame, drag/resize via refs
src/compositor/Workspace.tsx
src/themes/types.ts                # ThemePack
src/themes/hyprland/index.ts       # tokens, curves, components
src/themes/hyprland/Bar.tsx, Bar.css, theme.css
src/kernel/shell/shell.ts          # createShell()
src/kernel/shell/commands/*.ts     # one file per command
src/apps/registry.ts               # AppDef registry
src/apps/terminal/Terminal.tsx     # xterm + WebGL addon
src/boot/Boot.tsx                  # fake systemd boot screen
src/desktop/Desktop.tsx            # wallpaper + bar + workspaces + banner
e2e/desktop.spec.ts
.github/workflows/ci.yml
```

---

### Task 1: Scaffold, tooling and headers

**Files:**
- Create: all root config files above, `src/main.tsx`, `index.html`, `public/_headers`, `src/smoke.test.ts`

**Interfaces:**
- Produces: scripts `pnpm dev | build | test | test:e2e | size | lint | deploy`.

- [ ] **Step 1:** `pnpm create vite@latest . --template react-ts`, then add deps listed in Tech Stack. Enable React Compiler in `vite.config.ts` via `@vitejs/plugin-react` babel plugins. Vitest `environment: 'jsdom'`, `setupFiles: ['fake-indexeddb/auto']`.
- [ ] **Step 2:** Write `src/smoke.test.ts`: `expect(1 + 1).toBe(2)`; run `pnpm test` → PASS (tooling check).
- [ ] **Step 3:** `public/_headers`:
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
```
Also set the same two headers in `vite.config.ts` `server.headers` and `preview.headers`.
- [ ] **Step 4:** `wrangler.jsonc`: `{ "name": "riceboot", "compatibility_date": "2026-10-01", "assets": { "directory": "./dist", "not_found_handling": "single-page-application" } }`. Script `deploy`: `pnpm build && wrangler deploy`.
- [ ] **Step 5:** `.size-limit.json`: `[{ "path": "dist/assets/index-*.js", "limit": "450 KB", "gzip": true }]`.
- [ ] **Step 6:** `playwright.config.ts`: projects `chromium` and `firefox`, `webServer: pnpm build && pnpm preview --port 4173`.
- [ ] **Step 7:** Run `pnpm build && pnpm size` → both pass. Commit `chore: scaffold vite react ts with test tooling and COOP/COEP headers`.

### Task 2: VFS path utilities + memory backend

**Files:**
- Create: `src/kernel/vfs/path.ts`, `types.ts`, `memory.ts`
- Test: `src/kernel/vfs/path.test.ts`, `src/kernel/vfs/memory.test.ts`

**Interfaces:**
- Produces:
```ts
// path.ts
normalize(p: string, cwd?: string, home?: string): string  // absolute, no trailing slash except "/"
dirname(p: string): string; basename(p: string): string; join(...p: string[]): string
// types.ts
type NodeType = 'file' | 'dir'
interface Stat { type: NodeType; size: number; mtime: number }
class VfsError extends Error { code: 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'ENOTEMPTY'; path: string }
type WatchEvent = { type: 'write' | 'delete' | 'mkdir'; path: string }
interface Vfs {
  readFile(p: string): Promise<string>
  writeFile(p: string, data: string): Promise<void>   // parent must exist
  mkdir(p: string, opts?: { recursive?: boolean }): Promise<void>
  readdir(p: string): Promise<string[]>                // sorted
  stat(p: string): Promise<Stat>
  exists(p: string): Promise<boolean>
  rm(p: string, opts?: { recursive?: boolean }): Promise<void>
  watch(prefix: string, cb: (e: WatchEvent) => void): () => void
  reset(): Promise<void>
  readonly persistent: boolean
}
// memory.ts
createMemoryVfs(): Vfs   // persistent = false
```

- [ ] **Step 1: Write failing tests** — `path.test.ts`:
  - `normalize('a/../b', '/home/user')` → `/home/user/b`
  - `normalize('..', '/')` → `/`
  - `normalize('~/x/', '/', '/home/user')` → `/home/user/x`
  - `normalize('//etc///hypr/')` → `/etc/hypr`
  - `basename('/a/b.txt')` → `b.txt`, `dirname('/a')` → `/`

  `memory.test.ts`:
  - write then read returns same string; `stat().size` equals byte length
  - `writeFile('/nope/x', '')` rejects with `code: 'ENOENT'`
  - `readFile` on a dir rejects `EISDIR`; `readdir` on a file rejects `ENOTDIR`
  - `mkdir('/a/b/c', { recursive: true })` then `readdir('/a/b')` → `['c']`
  - `rm` non-empty dir without recursive rejects `ENOTEMPTY`; with recursive removes subtree
  - `watch('/home', cb)` receives `{ type: 'write', path: '/home/f' }`; unsubscribe stops events; writes under `/etc` not delivered
  - `reset()` leaves only `/`
- [ ] **Step 2:** `pnpm test src/kernel/vfs` → FAIL (modules missing).
- [ ] **Step 3:** Implement. Memory backend stores a `Map<string, {type, data?, mtime}>` keyed by normalized path.
- [ ] **Step 4:** `pnpm test src/kernel/vfs` → PASS.
- [ ] **Step 5:** Commit `feat(vfs): path utils and in-memory backend`.

### Task 3: IndexedDB backend, fallback and seed

**Files:**
- Create: `src/kernel/vfs/idb.ts`, `src/kernel/vfs/index.ts`
- Test: `src/kernel/vfs/idb.test.ts`, `src/kernel/vfs/index.test.ts`

**Interfaces:**
- Consumes: `Vfs`, `VfsError`, `createMemoryVfs` (Task 2).
- Produces:
```ts
createIdbVfs(dbName?: string): Promise<Vfs>      // default 'riceboot-vfs', persistent = true
createVfs(): Promise<Vfs>                        // idb, else memory fallback
seedHome(vfs: Vfs): Promise<void>                // idempotent; creates default tree
HOME = '/home/user'
```
Seed tree: `/home/user/{Documents,Downloads,Pictures,.config/hypr}`, `/home/user/.config/hypr/hyprland.conf` (copy of `src/themes/hyprland/default.conf`), `/home/user/README.txt` (welcome text), `/etc/os-release` (`NAME="Arch Linux"`, `ID=arch`).

- [ ] **Step 1: Write failing tests** — `idb.test.ts` runs the same behavioral suite as Task 2 (extract it to `vfsContract.ts` exporting `runVfsContract(make: () => Promise<Vfs>)` and call it from both test files), plus:
  - data persists across two `createIdbVfs('t1')` instances
  - `reset()` wipes the DB

  `index.test.ts`:
  - `falls back to memory when indexedDB.open throws` → stub `indexedDB.open` to throw; `createVfs()` resolves with `persistent === false`
  - `seedHome` twice does not overwrite a user-edited `README.txt`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `idb`; one object store `nodes`, keyPath `path`. Keep an in-memory cache loaded on open so `readdir` doesn't scan the store.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(vfs): indexeddb backend with memory fallback and home seed`.

### Task 4: Bezier, animator and dwindle layout

**Files:**
- Create: `src/compositor/bezier.ts`, `animator.ts`, `layout/dwindle.ts`
- Test: `bezier.test.ts`, `animator.test.ts`, `layout/dwindle.test.ts`

**Interfaces:**
- Produces:
```ts
cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number
interface Rect { x: number; y: number; w: number; h: number }
interface Gaps { inner: number; outer: number }
dwindle(ids: string[], area: Rect, gaps: Gaps): Record<string, Rect>
interface Animator {
  animate(el: HTMLElement, from: Rect, to: Rect, opts: { durationMs: number; ease: (t: number) => number; opacity?: [number, number] }): Promise<void>
  cancel(el: HTMLElement): void
}
createAnimator(raf?: (cb: FrameRequestCallback) => number, now?: () => number): Animator
```
Dwindle rule (Hyprland default): first window fills the area minus outer gaps; each new window splits the *last* window's rect in half, alternating vertical split when `w >= h`, horizontal otherwise; inner gap between siblings.

- [ ] **Step 1: Write failing tests**
  - bezier: `ease(0)=0`, `ease(1)=1`; `cubicBezier(0,0,1,1)(0.5) ≈ 0.5` (±1e-3); Hyprland default `cubicBezier(0.05,0.9,0.1,1.05)` is monotonic-ish and `> 0.9` at `t=0.5`
  - dwindle, area `{0,0,1000,600}`, gaps `{inner:10,outer:20}`:
    - 1 id → `{x:20,y:20,w:960,h:560}`
    - 2 ids → `a:{20,20,475,560}`, `b:{505,20,475,560}`
    - 3 ids → `b` split horizontally: `b:{505,20,475,275}`, `c:{505,305,475,275}`
    - `never yields negative or zero sizes on tiny area` → 6 ids in `{0,0,50,40}` all `w>=1 && h>=1`
    - empty list → `{}`
  - animator with fake `raf`/`now`: after advancing to `durationMs`, `el.style.transform === 'translate(Xpx, Ypx)'` of `to` and width/height set; promise resolves; `cancel` stops updates; never calls into React (pure DOM).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Bezier via Newton–Raphson on x then evaluate y. Animator sets `transform: translate()`, `width`, `height`, `opacity` on `el.style` each frame, sets `will-change: transform` during the tween and clears it after.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(compositor): bezier easing, ref animator and dwindle layout`.

### Task 5: WM store (windows, workspaces, floating)

**Files:**
- Create: `src/compositor/store.ts`
- Test: `src/compositor/store.test.ts`

**Interfaces:**
- Consumes: `dwindle`, `Rect`, `Gaps` (Task 4).
- Produces:
```ts
interface WinState { id: string; appId: string; title: string; workspace: number; floating: boolean; floatRect?: Rect; fullscreen: boolean }
interface WmState {
  windows: Record<string, WinState>; order: Record<number, string[]>  // per workspace, tiling order
  active: number /* 1..10 */; focused: string | null; area: Rect; gaps: Gaps
  open(appId: string, title: string): string
  close(id: string): void; killActive(): void
  focus(id: string): void; switchWorkspace(n: number): void; moveToWorkspace(id: string, n: number): void
  toggleFloating(id: string): void; toggleFullscreen(id: string): void
  setArea(r: Rect): void
  layout(): Record<string, Rect>   // rects for windows on the active workspace
}
createWmStore(): UseBoundStore<StoreApi<WmState>>
```

- [ ] **Step 1: Write failing tests**
  - `open` puts window on active workspace, focuses it, `layout()` matches `dwindle`
  - `closing the only window leaves an empty layout` and `focused === null`
  - closing focused window focuses previous in order
  - `killactive on empty workspace is a no-op`
  - `switchWorkspace(3)` then `open` → window has `workspace: 3`; workspace 1 windows absent from `layout()`
  - `switchWorkspace(0)` / `(11)` ignored
  - `toggleFloating` removes from tiling order; its rect is `floatRect` (default centered 60% of area); remaining tiled windows re-layout
  - `toggleFullscreen` → its rect equals `area`
  - `setArea` changes `layout()` output
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `zustand/vanilla` `createStore` wrapped by `create` for React hook use; ids via `crypto.randomUUID()`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(compositor): window manager store`.

### Task 6: Keybind dispatcher

**Files:**
- Create: `src/compositor/keybinds.ts`
- Test: `src/compositor/keybinds.test.ts`

**Interfaces:**
- Consumes: `WmState` actions (Task 5).
- Produces:
```ts
type Action = 'exec:terminal' | 'killactive' | 'togglefloating' | 'fullscreen' | `workspace:${number}` | `movetoworkspace:${number}` | 'launcher'
interface Binding { combo: string /* e.g. "MOD+Return" */; action: Action }
DEFAULT_BINDINGS: Binding[]  // MOD+Return terminal, MOD+Q killactive, MOD+V togglefloating, MOD+F fullscreen, MOD+1..0 workspace 1..10, MOD+SHIFT+1..0 movetoworkspace
parseCombo(combo: string, mod: 'Alt' | 'Meta' | 'Control'): { key: string; alt: boolean; ctrl: boolean; meta: boolean; shift: boolean }
createDispatcher(opts: { bindings: Binding[]; mod?: 'Alt' | 'Meta' | 'Control'; run: (a: Action) => void }): (e: KeyboardEvent) => void
```
Matching uses `e.code` for digits (`Digit1`) so Shift doesn't change the key; `e.key` for letters (case-insensitive) and `Return` ↔ `Enter`.

- [ ] **Step 1: Write failing tests**
  - `uses Alt as default mod`: `keydown {key:'Enter', altKey:true}` → `run('exec:terminal')`
  - `Alt+Shift+Digit3` → `movetoworkspace:3`; `Alt+Digit0` → `workspace:10`
  - `prevents default only for bound combos`: bound → `defaultPrevented === true`; `Alt+X` unbound → false and `run` not called
  - with `mod: 'Meta'`, `Alt+Enter` does nothing
  - ignores events while `e.isComposing`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(compositor): keybind dispatcher`.

### Task 7: ThemePack type + Hyprland theme

**Files:**
- Create: `src/themes/types.ts`, `src/themes/hyprland/{index.ts,Bar.tsx,Bar.css,theme.css,default.conf}`
- Test: `src/themes/hyprland/Bar.test.tsx`

**Interfaces:**
- Consumes: `cubicBezier` (Task 4), WM store hook (Task 5).
- Produces:
```ts
interface ThemeTokens { bg: string; fg: string; accent: string; accent2: string; borderActive: [string, string]; borderInactive: string; radius: number; borderSize: number; blur: number; font: string; gaps: Gaps }
interface ThemePack {
  id: 'hyprland' | 'caelestia'
  tokens: ThemeTokens
  curves: { windowIn: (t: number) => number; workspace: (t: number) => number; durationMs: number }
  components: { Bar: React.ComponentType<{ height: number }> }
  barHeight: number
  wallpaperCss: string     // M1: CSS gradient; WebGPU arrives in M2
}
loadTheme(id: ThemePack['id']): Promise<ThemePack>   // in src/themes/index.ts via import()
```
Hyprland tokens: Catppuccin Mocha palette (`bg #1e1e2e`, `fg #cdd6f4`, `accent #cba6f7`, `accent2 #89b4fa`), `borderActive ['#cba6f7','#89b4fa']`, `radius 10`, `borderSize 2`, `blur 8`, gaps `{inner: 5, outer: 10}` (scaled ×2 in CSS px), font `"JetBrainsMono Nerd Font", monospace`, curve `cubicBezier(0.05,0.9,0.1,1.05)`, `durationMs 300`, `barHeight 34`. Active border is an animated conic gradient using `@property --angle` rotating 360° in 4 s.

- [ ] **Step 1: Write failing test** — render `Bar` with a store where workspaces 1 and 3 have windows and 3 is active: shows buttons `1..5` plus any occupied >5; `3` has `aria-current="true"`; occupied ones have class `occupied`; clicking `1` calls `switchWorkspace(1)`; clock text matches `/\d{2}:\d{2}/`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement Bar (left: workspaces; center: focused window title; right: clock, placeholder tray icons for net/vol/battery). Add `@testing-library/react` if not present.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(themes): hyprland theme pack with waybar-style bar`.

### Task 8: Fake shell

**Files:**
- Create: `src/kernel/shell/shell.ts`, `src/kernel/shell/commands/{ls,cd,pwd,cat,echo,mkdir,rm,touch,clear,help,fastfetch,hyprctl}.ts`
- Test: `src/kernel/shell/shell.test.ts`

**Interfaces:**
- Consumes: `Vfs`, `normalize`, `HOME` (Tasks 2–3); `WmState` (Task 5) read-only for `hyprctl`.
- Produces:
```ts
interface ShellIO { write(s: string): void; clear(): void }
interface Shell { readonly cwd: string; prompt(): string; run(line: string): Promise<number> /* exit code */ }
interface ShellEnv { vfs: Vfs; io: ShellIO; wm?: () => Pick<WmState, 'windows' | 'active'>; user?: string; host?: string }
createShell(env: ShellEnv): Shell
type Command = (args: string[], ctx: { shell: Shell; env: ShellEnv; setCwd(p: string): void }) => Promise<number>
```
Prompt: `\x1b[1;35muser\x1b[0m@\x1b[1;34marchlinux\x1b[0m \x1b[36m~\x1b[0m ❯ ` (cwd shown with `~` for HOME). Output lines end with `\r\n` (xterm).

- [ ] **Step 1: Write failing tests** (memory VFS + seeded home, collecting `io.write` into a string):
  - `pwd` → `/home/user\r\n`
  - `mkdir foo && cd foo && pwd` → supports `&&`; prints `/home/user/foo`
  - `cd to missing dir prints error`: `cd nope` → `cd: no such file or directory: nope`, exit 1
  - `cd` with no args and `cd ~` → HOME; `cd ..` from `/` stays `/`
  - `ls` in HOME lists seeded entries, dirs colored blue (`\x1b[1;34m`); `ls -a` includes `.config`
  - `echo hi > a.txt` then `cat a.txt` → `hi\r\n`; `echo x >> a.txt` appends
  - `rm` on dir without `-r` → error, exit 1
  - unknown command `vim` → `riceboot: command not found: vim` plus hint line containing `boot real Linux`, exit 127
  - `fastfetch` output contains `Arch Linux`, `Hyprland`, `kitty` and the ASCII Arch logo first line
  - `hyprctl clients` lists open window titles with workspace numbers
  - empty line → exit 0, no output
  - quoting: `echo "a  b"` → `a  b`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: tokenizer with single/double quotes, `&&`, `>`, `>>`; command map from `commands/`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(shell): fake shell with core commands on vfs`.

### Task 9: Terminal app + app registry

**Files:**
- Create: `src/apps/registry.ts`, `src/apps/terminal/{Terminal.tsx,lineEditor.ts}`
- Test: `src/apps/terminal/lineEditor.test.ts`

**Interfaces:**
- Consumes: `createShell` (Task 8), `ThemeTokens` (Task 7).
- Produces:
```ts
interface AppCtx { vfs: Vfs; windowId: string; tokens: ThemeTokens; setTitle(t: string): void }
interface AppDef { id: string; title: string; icon: string; load: () => Promise<{ default: React.ComponentType<AppCtx> }>; defaultSize?: { w: number; h: number } }
APPS: Record<string, AppDef>    // M1: { terminal }
prefetchApps(ids: string[]): void  // calls load() inside requestIdleCallback, skipped if navigator.connection?.saveData
// lineEditor.ts — pure, no xterm dependency
createLineEditor(opts: { onSubmit(line: string): void; write(s: string): void }): { feed(data: string): void; history: string[] }
```
Line editor handles printable chars, Backspace (`\x7f`), Enter (`\r`), Ctrl+C (`\x03` → `^C` and new prompt), Up/Down history (`\x1b[A`/`\x1b[B`), Left/Right cursor moves.

- [ ] **Step 1: Write failing tests** for lineEditor: typing `ls\r` submits `ls`; `ab\x7f\r` submits `a`; Backspace on empty writes nothing; Up after two submissions recalls the last; Ctrl+C clears buffer and writes `^C\r\n`; mid-line insert after Left works.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `lineEditor.ts`; then `Terminal.tsx`: xterm with theme from tokens, load `WebglAddon` (on `onContextLoss` dispose and keep canvas renderer), `FitAddon` + `ResizeObserver`. Title `user@archlinux: <cwd>`. Terminal is only reachable via `APPS.terminal.load` (dynamic import).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(apps): terminal with webgl renderer and line editor`.

### Task 10: Desktop, windows, boot screen

**Files:**
- Create: `src/compositor/{Window.tsx,Workspace.tsx}`, `src/desktop/Desktop.tsx`, `src/boot/Boot.tsx`, `src/boot/bootLines.ts`
- Modify: `src/main.tsx`
- Test: `src/boot/bootLines.test.ts`, `e2e/desktop.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `<Desktop vfs={Vfs} theme={ThemePack} />`; `data-testid` hooks: `desktop`, `window-<appId>`, `bar`, `storage-banner`.

Behavior:
- `Boot` shows `bootLines()` (systemd-style `[  OK  ] Started …` lines, ending with `Reached target Graphical Interface`) at ~40 ms per line while `createVfs()`, `seedHome()`, `loadTheme('hyprland')` resolve. It finishes when both the lines are done and loading is complete. Skippable with any key. Then `Desktop` mounts.
- `Desktop`: wallpaper (`wallpaperCss`), Bar on top, `Workspace` for the active workspace, keydown listener from `createDispatcher`, `setArea` on resize (area excludes bar), `storage-banner` when `!vfs.persistent`, idle `prefetchApps(['terminal'])`. Empty workspace shows a centered hint: `Alt + Enter — open terminal`.
- `Window`: absolutely positioned; geometry from `layout()` applied through `Animator` (open: scale/opacity in with `curves.windowIn`; re-layout: tween rect). Floating windows are draggable with a titlebar-less drag (Alt+left-drag, like Hyprland) and resizable from the bottom-right corner. Pointer moves write `transform` directly and commit `floatRect` to the store only on pointerup. Click focuses. Active window has the gradient border. Each window has an error boundary.

- [ ] **Step 1: Write failing tests**
  - `bootLines()` returns ≥ 15 strings, first starts with `[  OK  ]` or `Welcome to`, last contains `Graphical Interface`
  - `e2e/desktop.spec.ts` (chromium + firefox):
    - load `/` → `desktop` visible within 5 s; `crossOriginIsolated === true` in page
    - press `Alt+Enter` → `window-terminal` visible; type `fastfetch` + Enter → page text contains `Arch Linux`
    - `Alt+Enter` again → two windows side by side (bounding boxes don't overlap)
    - `Alt+Q` → one window left; `Alt+2` → bar shows workspace 2 active and no windows
    - reload → `README.txt` edit persists: run `echo hi > t.txt`, reload, `cat t.txt` shows `hi`
- [ ] **Step 2:** Run `pnpm test src/boot` and `pnpm test:e2e` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test` and `pnpm test:e2e` → PASS on both browser projects.
- [ ] **Step 5:** Commit `feat(desktop): boot screen, desktop and animated windows`.

### Task 11: CI, size budget and deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1:** CI on push/PR: `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm test` → `pnpm build` → `pnpm size` → `npx playwright install --with-deps chromium firefox` → `pnpm test:e2e`. Deploy job on `main` only: `wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
- [ ] **Step 2:** Verify locally: `pnpm build && pnpm size` → boot chunk under 450 KB gzip and terminal/xterm in a separate chunk (check `dist/assets` names).
- [ ] **Step 3:** Verify headers locally: `pnpm preview` + `curl -sI http://localhost:4173 | rg -i 'cross-origin'` → both headers present.
- [ ] **Step 4:** README: what it is, `pnpm dev`, test commands, deploy steps (`wrangler login` by the user, set the two GitHub secrets).
- [ ] **Step 5:** Commit `ci: test, size budget, e2e and cloudflare deploy`. First real deploy (`pnpm deploy`) is run by the user after `wrangler login`.
