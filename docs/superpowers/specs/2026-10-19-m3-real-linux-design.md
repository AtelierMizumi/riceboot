# riceboot — M3: Real Linux in the Terminal

Date: 2026-10-19
Status: Approved for M3a. Packaged image, no guest networking. M3a package set: `python3`, `neovim`, `git`, `fastfetch` plus their dependency closure (48 packages, pinned at Alpine v3.24, x86).
Supersedes the M3 section of `2026-10-18-riceboot-design.md` (its relay-based networking and R2 hosting
are dropped; see §2). Networking options considered and parked: a curated mirror behind a Worker
`cors_proxy`, and an in-browser Tailscale client.

## 1. Goal

The Terminal app can switch from the simulated shell to a **real Linux (Alpine x86)** running
in the browser with v86. A newcomer can run real tools (python3, git, neovim, fastfetch) without
installing anything, and the VM loads only when they ask for it.

Non-goals for M3:
- Guest networking (no `apk add` from the internet, no `git clone`).
- GUI apps, Wayland, Hyprland inside the VM.
- Multi-user, sharing, cloud saves.

## 2. Evidence behind the decisions

Measured in the spike (`docs/research/` will hold the write-up):

| Question | Result |
|---|---|
| Alpine x86 boots in v86 | Yes. Cold boot about 35–50 s on a loaded machine; snapshot restore about 0.4 s. |
| Real `apk add` over a Wisp relay on Cloudflare | Works, but `apk add` of 47 packages took 277 s. Download throughput was the bottleneck; batching changed bandwidth but made `apk add` slower. |
| Free-tier fit of a Wisp relay | Not viable: Workers Free allows 6 concurrent outbound connections per request and 10 ms CPU per invocation. |
| v86 `fetch` backend | Works for HTTP on port 80 (20 MB in 12 s), but **blocked from an HTTPS page** by mixed-content rules. Production is HTTPS, so this path is out. |
| Packaged image, lazy loaded | Works on Cloudflare static assets. Login 84 s on a cold cache; `python3` 22 s; `fastfetch` 3.4 s. 29 MB of a 256 MB image fetched for those commands. |
| Chunk size | 16 MiB parts fetched about 96 MB for the same work; 1 MiB parts fetched 29 MB. Use 1 MiB. |
| Bundle size | `libv86.js` 94 KB gzip, `v86.wasm` 381 KB gzip. Must be loaded lazily, never in the boot bundle. |

Consequence: the guest has **no network**. Packages are chosen at image build time.

## 3. Architecture

```
Browser (riceboot app)                       Cloudflare (static assets, free, no code)
├─ boot bundle ≤ 450 KB gzip                 ├─ riceboot app
│  └─ Terminal app: simulated shell (default) └─ vm/: v86 runtime + image parts (1 MiB each)
└─ on "Real Linux": dynamic import of v86 ──────┘
   ├─ v86 emulator (Web Worker if feasible)
   ├─ disk: async, use_parts, fixed_chunk_size 1 MiB, read-only base image
   ├─ write overlay: changed blocks kept in IndexedDB
   └─ serial0 ⇄ xterm.js in the Terminal window
```

### 3.1 Image build (`tools/build-image/`, runs in CI or locally)
- Input: a package list (`packages.txt`), Alpine x86 repos pinned to a release.
- Resolve the dependency closure from `APKINDEX` (the resolver used in the spike, moved into the repo with tests).
- Extract packages into a root tree, add a `/etc/motd` and a `riceboot` profile.
- `mke2fs -t ext2 -d <tree>` builds the base image. Size: the smallest power-of-two MiB that fits, with headroom for the overlay.
- Split into 1 MiB parts named `<name>-<start>-<end>.img` (the v86 `use_parts` naming). Pad the last part to 1 MiB.
- Output into `public/vm/`. Image ≤ 25 MiB per file holds by construction. The total is checked against a budget (§7).
- The Alpine kernel and initramfs come from the Alpine release, not from the image.

### 3.2 Runtime (`src/vm/`)
- `loadVm()` dynamically imports v86 and returns an `emulator` wrapper. Nothing is loaded until the user picks "Real Linux".
- The wrapper exposes `write(bytes)`, `onOutput(cb)`, `boot()`, `stop()`, `reset()`.
- Boot options: `bios`, `vga_bios`, `cdrom` or direct kernel boot (see §8, open question), `hda` as async parts, `memory_size` 256 MiB, no network device.
- Serial output feeds xterm.js. The line discipline stays inside the guest; the app does not edit input.

### 3.3 Persistence
- Writes to the disk stay in an in-memory overlay keyed by 1 MiB block.
- Dirty blocks are flushed to IndexedDB (`riceboot-vm`, store `blocks`) on a 2 s debounce and on `pagehide`.
- Next boot: the base parts come from the network or cache; dirty blocks from IndexedDB override them.
- **Reset** deletes the overlay and reloads the base. Reset is a visible button in the Terminal title bar.
- Storage quota errors show a banner and keep writes in memory.

### 3.4 Terminal integration
- The Terminal app keeps the simulated shell as the default mode.
- A mode switch in the title bar: `shell` / `linux`. Switching to `linux` loads the VM on demand, with a progress line built from real byte counts of the parts fetched.
- The simulated shell keeps working when the VM is unavailable (unsupported browser, out of memory, load failure).
- `apk` in the VM prints a clear message: packages come from the image, networking is off.

## 4. Error handling

| Failure | Behaviour |
|---|---|
| WebAssembly or memory unavailable | Stay in shell mode; show "Real Linux needs WebAssembly and about 300 MB free memory". |
| A part fails to load | Retry with backoff up to 3 times; then show the failed part and offer retry. |
| IndexedDB unavailable | Overlay in memory; banner "changes won't be kept after reload". |
| Guest panics | Show the serial log tail and a Reset button. |
| Image version mismatch with overlay | Overlay is tagged with the image build id; mismatch means the overlay is discarded after confirmation. |

## 5. Testing

Test-first, per project convention.
- **Unit (Vitest):** closure resolver (fixtures from a trimmed `APKINDEX`), part naming and padding, overlay block math, overlay ↔ IndexedDB round trip with `fake-indexeddb`, mode switch state machine.
- **Build check:** the image builder reproduces the same image hash for the same inputs (deterministic `mke2fs` options and timestamps).
- **Budget checks in CI:** boot bundle ≤ 450 KB gzip (existing `size-limit`); total `public/vm/` ≤ the budget in §7.
- **E2E (Playwright, chromium + firefox):** open Terminal → switch to `linux` → wait for `login:` → `fastfetch` output appears → `python3 -c 'print(1)'` prints `1` → reload → a file written in the VM survives → Reset clears it.
- **Bench (manual, recorded):** cold/warm boot, bytes fetched for `fastfetch`, bytes fetched for `python3`.

## 6. Milestones

- **M3a — read-only Linux:** image builder, lazy parts, `linux` mode in the Terminal, E2E for boot + `fastfetch` + `python3`. No persistence.
- **M3b — persistence:** overlay, IndexedDB, Reset, reload test.
- **M3c — package set:** agree the list with the user; add packages; re-measure bytes and budget.

## 7. Budgets

- Boot bundle: ≤ 450 KB gzip, unchanged from M1.
- VM runtime (v86 JS + wasm): ≤ 500 KB gzip, loaded only on demand.
- Image parts (`public/vm/`): ≤ 300 MB total for M3a. Cloudflare static assets limits to check before going above this.
- Requests: static assets are free and unlimited; the app itself has no backend, so the free plan's 100k Worker requests/day is not used by the VM.

## 8. Open questions

1. **Direct kernel boot vs CD-ROM boot.** Booting from the 64 MB ISO downloads the whole ISO for the kernel. Extracting the kernel and initramfs from the Alpine release could cut the first boot a lot. To be measured in M3a, not decided here.
2. **Web Worker.** v86 can run in a worker, but the serial and disk hooks need checking. Start on the main thread; move to a worker only if the UI stutters.
3. **Package set for M3a.** Proposed: `python3`, `neovim`, `git`, `fastfetch`, plus their closure. Needs your sign-off.
4. **Firefox performance.** Boot and wasm speed on Firefox are unmeasured. E2E must pass on both engines before M3a closes.

## 9. Out of scope

Guest networking, `apk` online, user accounts, sharing, GUI apps, mobile layout for the VM.
