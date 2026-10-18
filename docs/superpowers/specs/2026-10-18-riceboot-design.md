# riceboot — Design Spec

Date: 2026-10-18
Status: Approved in brainstorming, pending written-spec review

## 1. Goal

A browser-based "riced" Arch Linux desktop that lets people who have never used
Linux get hands-on with what an r/unixporn-style setup looks and feels like:
tiling window manager, bar, widgets, launcher, terminal, editor and browser —
instantly, with no install.

Success criteria:
- Desktop is interactive in < 2 s on a 4G connection (first visit), near-instant on repeat visits.
- Window drag/resize and workspace switches hold 60 fps on mid-range hardware (higher on high-refresh displays).
- A newcomer can, unaided (guided by the tour), open a terminal, run `fastfetch`, switch rice, edit `hyprland.conf` and see the desktop change live.
- Real commands (bash, python, gcc, git, neovim) run once the user opts in to booting the VM.
- Hosted entirely on a personal Cloudflare account, within free-tier limits for expected traffic.

## 2. Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Realism | **Hybrid**: desktop shell is a custom web UI; terminal starts as a simulated shell; a real Linux VM (v86/WASM) is lazy-loaded on demand |
| Rices in MVP | **Hyprland** and **Caelestia**, switchable at runtime |
| Browser app | **iframe + allowlist** (embeddable sites only) + a riced start page; blocked sites show "open in real tab". No proxy |
| Coding | **CodeMirror 6 editor** + run code through the lazy VM; shared VFS with terminal |
| Persistence | **IndexedDB** per browser, with "reset to fresh install" |
| Stack | **Vite + React 19 (React Compiler) + TypeScript**, static SPA, zustand stores |
| Hosting | Cloudflare **Workers Static Assets** (app) + **R2** (heavy assets) |

## 3. Rendering & Runtime

Hybrid rendering — each layer uses the tool best suited for it. Full-canvas
rendering is rejected because window contents (iframes, text inputs, IME,
clipboard, accessibility) must be DOM.

| Layer | Technology |
|---|---|
| Wallpaper / live wallpaper / background effects | WebGPU, fallback WebGL2, single fullscreen canvas |
| Windows & Hyprland-style animations | DOM with GPU-composited `transform`/`opacity`; animation curves are cubic beziers taken from the theme (`hyprland.conf` `bezier=` semantics). Hot paths (drag, resize, workspace swipe) write styles via refs and never trigger React renders |
| Borders, corners, shadows, blur | CSS `backdrop-filter`, `@property`-animated conic gradients; shader-based in `ultra` tier |
| Terminal | xterm.js + WebGL renderer addon, Nerd Font, truecolor |
| Real Linux | v86 running in a Web Worker; disk image chunked on R2 |
| Editor | CodeMirror 6 themed from rice tokens |

**Quality tiers**: on boot, probe WebGPU/WebGL support and measure frame time
for ~1 s, then pick `ultra` (WebGPU, blur, live wallpaper), `balanced`, or
`lite` (static image, no blur). User-overridable in Settings and via
`decoration { blur { enabled } }` in `hyprland.conf`.

**Headers**: `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless` to enable cross-origin
isolation (SharedArrayBuffer for the VM) while still allowing allowlisted
iframes. Must be verified early (M1) across Chrome/Firefox/Safari; if Safari
lacks `credentialless`, the VM falls back to non-SAB mode.

## 4. Modules

```
src/
  kernel/        # OS core, UI-agnostic, pure TS, heavily unit-tested
    vfs/         # IndexedDB-backed virtual FS; POSIX-like API: read/write/stat/readdir/watch
    proc/        # app registry + processes (pid, open/close, focus)
    pkg/         # "pacman": reads manifest, lazy-loads chunks/assets, reports progress
    vm/          # bridge to v86 worker; mounts VFS into VM via 9p
  compositor/    # WM: dwindle tiling + floating, workspaces, keybinds, animations
  render/        # WebGPU/WebGL2 wallpaper renderer + tier detection
  themes/
    hyprland/    # waybar-style bar, rofi-style launcher, notifications, lockscreen, tokens, curves
    caelestia/   # Caelestia shell: dashboard, sidebar, launcher, widgets
  apps/          # terminal, editor, browser, files, settings, fastfetch
```

Interfaces:
- **ThemePack** = `{ id, tokens, curves, components: { Bar, Launcher, Notifications, Lockscreen, Widgets }, wallpaper, defaultConfig }`, loaded via dynamic `import()`. Switching themes requires no page reload.
- **App** = `{ id, title, icon, load: () => import(...), defaultSize, singleton? }`. Apps receive a `ctx` (vfs, proc, theme tokens) and never import other apps.
- **Config as real files**: `~/.config/hypr/hyprland.conf` and `~/.config/waybar/config.jsonc` (and a Caelestia equivalent) live in the VFS. Parsers translate them to compositor/theme settings; a VFS `watch` triggers live reload on save. Parse errors show as a Hyprland-style red error bar and keep the last good config.
- **Fake shell**: runs against the VFS; supports `ls cd pwd cat echo mkdir rm touch clear help fastfetch neofetch pacman hyprctl theme`. Unknown command → offers "boot real Linux to run this (~X MB download)". After VM boot, the terminal attaches to the VM's serial/console.

Onboarding: a short skippable tour (Super+Enter terminal, Super+D launcher,
Super+1..9 workspaces, Super+Q close), an always-available keybind cheatsheet,
and mouse/touch equivalents for every keybind. Super is mapped to a configurable
key because browsers/OSes intercept the real Super key.

## 5. Delivery & Download Reduction

```
riceboot.<domain>         → Workers Static Assets: SPA shell + hashed JS chunks (immutable)
assets.riceboot.<domain>  → R2 public bucket via custom domain + Cache Rules
                             wallpapers/, fonts/, icons/, vm/arch-<hash>/chunk-NNNN.bin
```

Load layers:
1. **Boot (≤ 450 KB gzip, enforced in CI)**: HTML, shell, compositor, default theme, shader wallpaper. A fake `systemd [ OK ]` boot screen covers loading.
2. **Idle prefetch**: terminal + launcher via `requestIdleCallback`; skipped when `navigator.connection.saveData` or slow effective type.
3. **On demand**: editor, browser, second theme, extra fonts, image wallpapers (AVIF/WebP with `srcset`).
4. **VM**: minimal Arch image split into 1–4 MB chunks, fetched by v86 on sector demand (async chunked disk). Every R2 object < 25 MB, content-hashed, `Cache-Control: public, max-age=31536000, immutable`.

`public/manifest.json` lists every package (id, chunks, size, hash). The pkg
module drives loading and renders it pacman-style (`:: Retrieving packages...`
with progress bars) — lazy loading becomes part of the experience.

Service Worker (Workbox): precache layer 1; cache-first runtime cache for R2
assets keyed by hash; "clear cache" in Settings.

Quota protection: Cache Rule "cache everything" on `assets.`; basic WAF rate
limit; no dynamic backend in MVP.

CI (GitHub Actions): test → `pnpm build` → size-limit → `wrangler deploy` →
sync new hashed files in `assets/` to R2. VM image built in Docker (minimal Arch
+ bash, python, gcc, git, neovim, fastfetch), then chunked and uploaded.

## 6. Error Handling

- WebGPU/WebGL unavailable → `lite` tier, never a blank screen.
- Asset/chunk fetch fails → retry with backoff, then a notification with retry; app window shows an error state instead of crashing the desktop (per-window React error boundary).
- VM fails to boot or the device has too little memory → terminal stays in fake-shell mode with a clear message.
- IndexedDB unavailable (private mode) → in-memory VFS, banner "changes won't be saved".
- iframe refused → in-window page "This site doesn't allow embedding" + "Open in new tab".
- Invalid config → error bar, last good config retained.

## 7. Testing

Test-first for all logic (per project convention).
- **Vitest**: VFS, pkg resolver, config parsers, dwindle layout, keybind dispatcher, fake shell commands, tier selection logic.
- **Playwright e2e**: boot → Super+Enter → `fastfetch` → switch rice → edit `hyprland.conf` → layout changes; screenshot tests per rice.
- **Budgets**: size-limit (boot ≤ 450 KB gzip), Lighthouse CI (LCP, TBT).
- **Perf**: Playwright trace measuring frame times during window drag and workspace switch.

## 8. Milestones

- **M1 — Shell & compositor**: boot screen, tiling/floating WM, workspaces, keybinds, Hyprland theme, terminal with fake shell, IndexedDB VFS, COOP/COEP verification, Cloudflare deploy.
- **M2 — Second rice & live config**: Caelestia theme, CodeMirror editor, live-reload configs, launcher, notifications, onboarding tour, WebGPU wallpaper + quality tiers.
- **M3 — Real Linux**: v86 in worker, chunked image on R2, VFS ↔ VM via 9p, run code from editor.
- **M4 — Browser & polish**: iframe allowlist browser + start page, file manager, Service Worker, mobile/touch.

## 9. Out of Scope (MVP)

Accounts and rice sharing, web proxy, additional distros/rices, server-side VMs or streaming.
