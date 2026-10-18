# Kickoff prompt (for Claude Opus 5.5, low effort)

You are working in the `riceboot` repo. Read `docs/superpowers/specs/2026-10-18-riceboot-design.md` first — it is the source of truth. Do not change decisions recorded there without asking.

## Product

riceboot is a browser-based, "riced" Arch Linux desktop for people who have never used Linux. It should feel like stepping into an r/unixporn screenshot: a Hyprland-style tiling window manager with smooth bezier animations, gradient borders, blur, a waybar-style bar, a rofi-style launcher, widgets, a kitty-like terminal, and a code editor — plus a second rice in the style of the Caelestia shell. Visual fidelity and responsiveness come first; realism comes from a lazy-loaded real Linux VM (v86) that users opt into.

## Hard constraints

- Stack: Vite + React 19 (React Compiler) + TypeScript, zustand, pnpm. Static SPA, no SSR.
- Hosting: Cloudflare Workers Static Assets for the app, R2 for heavy assets. No paid services, no backend in MVP.
- Boot bundle ≤ 450 KB gzip. Everything else (apps, second theme, fonts, wallpapers, VM image) is loaded via dynamic `import()` or fetched from R2 on demand.
- Window drag/resize/workspace animations must never trigger React re-renders; write `transform`/`opacity` through refs.
- GPU: WebGPU wallpaper with WebGL2 fallback; quality tiers `ultra | balanced | lite`; never a blank screen.
- Test-first: write a failing Vitest test from the spec, see it fail for the right reason, then implement. Never weaken or skip tests to make them pass. Report real pass/fail counts.

## Current task: Milestone M1 only

1. Scaffold the repo (Vite React TS, Vitest, Playwright, size-limit, ESLint, wrangler config with COOP `same-origin` + COEP `credentialless` headers).
2. `kernel/vfs`: IndexedDB-backed VFS with POSIX-like API and `watch`, with an in-memory fallback. Tests first.
3. `compositor`: dwindle tiling + floating, 10 workspaces, keybind dispatcher (configurable "Super" key), bezier animation engine. Layout logic is pure and unit-tested.
4. `themes/hyprland`: tokens, bar (workspaces, clock, tray placeholders), gradient animated borders, blur.
5. `apps/terminal`: xterm.js + WebGL addon running a fake shell on the VFS (`ls cd pwd cat echo mkdir rm touch clear help fastfetch hyprctl`).
6. Fake `systemd` boot screen while the shell loads.
7. Playwright e2e: load → press Super+Enter → type `fastfetch` → output visible.
8. Deploy script with `wrangler deploy`.

Stop after M1, run `pnpm test`, `pnpm build`, the size-limit check and the e2e, and report the results honestly. Do not start M2.
