# riceboot

A riced Arch Linux desktop in your browser — for people who have never used Linux
and want to feel what an r/unixporn setup is like. Hyprland-style tiling, a
waybar-style bar, a kitty-like terminal with a simulated shell, and a persistent
home directory, all client-side.

Design: [`docs/superpowers/specs/2026-10-18-riceboot-design.md`](docs/superpowers/specs/2026-10-18-riceboot-design.md)

## Try it

```bash
pnpm install
pnpm dev
```

| Keys | Action |
|---|---|
| `Alt + Enter` | open terminal |
| `Alt + Q` | close focused window |
| `Alt + 1..0` | switch workspace |
| `Alt + Shift + 1..0` | move window to workspace |
| `Alt + V` | toggle floating (`Alt` + drag to move) |
| `Alt + F` | fullscreen |

In the terminal: `help`, `fastfetch`, `ls -a`, `cat ~/.config/hypr/hyprland.conf`, `hyprctl clients`.

Supported browsers: Chromium- and Firefox-based.

## Checks

```bash
pnpm test        # unit tests (Vitest)
pnpm test:e2e    # Playwright, chromium + firefox
pnpm lint
pnpm build && pnpm size   # boot chunk must stay ≤ 450 KB gzip
```

## Deploy (Cloudflare Workers Static Assets)

```bash
pnpm exec wrangler login   # once
pnpm run deploy
```

CI deploys `main` automatically once the repo has `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets. `public/_headers` sets COOP/COEP for
cross-origin isolation.
