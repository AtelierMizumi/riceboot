import { BlockOverlay } from './overlay'
import { captureDirty, hdaFromEmulator, restoreBlocks } from './diskState'
import { createFlusher, type Flusher } from './flusher'
import { startWatchdog } from './guards'
import { buildV86Options, type VmManifest } from './options'
import type { OverlayStore } from './overlayStore'
import { sttyCommand } from './resize'
import { loadRuntime as loadScript } from './runtime'

export interface VmSessionHandlers {
  onOutput(text: string): void
  /** The login prompt is up. Input typed now goes to getty, not a shell. */
  onBooted(): void
  /** A root shell prompt is up. Only now is it safe to send shell commands such as stty. */
  onShell(): void
  onFailed(reason: string): void
  /** A save failed (quota, storage blocked). The changes stay in memory and the next save retries. */
  onStorageError?(e: unknown): void
}

interface V86Emulator {
  add_listener(event: string, cb: (payload: never) => void): void
  remove_listener(event: string, cb: (payload: never) => void): void
  serial0_send(text: string): void
  run(): void
  stop(): Promise<void> | void
  destroy?(): Promise<void> | void
}

/** Seams for tests: the real runtime loader and emulator constructor are injected by default. */
export interface VmSessionDeps {
  load(src: string): Promise<void>
  create(options: object): V86Emulator
}

/** Saved changes for this build. `blocks` are restored into the package disk before the emulator runs. */
export interface VmOverlay {
  store: OverlayStore
  buildId: string
  blocks: Map<number, Uint8Array>
}

/** A login that has not appeared in this long is a failed boot (a stalled download, for example). */
export const BOOT_TIMEOUT_MS = 180_000
/** How often guest writes are captured from the disk. Saves are debounced separately. */
export const CAPTURE_INTERVAL_MS = 2000

const defaultDeps: VmSessionDeps = {
  load: loadScript,
  create: (o) => new (window as unknown as { V86: new (o: object) => V86Emulator }).V86(o),
}

/** One v86 emulator: loads the runtime, restores saved changes, streams serial output, and saves on stop. */
export class VmSession {
  private emu: V86Emulator | null = null
  private decoder = new TextDecoder('utf-8')
  private tail = ''
  private booted = false
  private shellReady = false
  private stopped = false
  private watchdog: { clear(): void } | null = null
  private overlay: BlockOverlay | null = null
  private flusher: Flusher | null = null
  private capture: ReturnType<typeof setInterval> | null = null
  private disk: ReturnType<typeof hdaFromEmulator> = null

  constructor(
    private readonly opts: { baseUrl: string; manifest: VmManifest; overlay?: VmOverlay },
    private readonly handlers: VmSessionHandlers,
    private readonly deps: VmSessionDeps = defaultDeps,
  ) {}

  async start(): Promise<void> {
    if (this.stopped) return
    try {
      await this.deps.load(`${this.opts.baseUrl}runtime/libv86.js`)
      if (this.stopped) return
      const options = buildV86Options({
        baseUrl: this.opts.baseUrl,
        manifest: this.opts.manifest,
        wasmPath: `${this.opts.baseUrl}runtime/v86.wasm`,
        autostart: false,
      })
      const emu = this.deps.create(options)
      this.emu = emu
      emu.add_listener('serial0-output-byte', this.onByte as (p: never) => void)
      emu.add_listener('download-error', this.onDownloadError as (p: never) => void)
      this.setupOverlay(emu)
      emu.run()
      this.watchdog = startWatchdog(BOOT_TIMEOUT_MS, () => this.fail('boot timed out'))
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e))
    }
  }

  write(text: string): void {
    if (!this.stopped) this.emu?.serial0_send(text)
  }

  /** Sends the terminal size to the guest shell. A no-op until the shell prompt has appeared. */
  resize(cols: number, rows: number): void {
    if (this.shellReady && !this.stopped) this.write(sttyCommand(cols, rows))
  }

  /** Saves pending changes, stops the emulator, removes its listeners and frees its memory. Idempotent.
   *  The promise resolves once the final save has finished. */
  stop(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    this.stopped = true
    this.watchdog?.clear()
    this.watchdog = null
    this.saveNow()
    let flushed: Promise<void> = Promise.resolve()
    if (this.flusher) {
      const f = this.flusher
      this.flusher = null
      flushed = f.flushNow().finally(() => f.dispose())
    }
    if (this.capture !== null) clearInterval(this.capture)
    this.capture = null
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide)
    const emu = this.emu
    this.emu = null
    if (emu) {
      emu.remove_listener('serial0-output-byte', this.onByte as (p: never) => void)
      emu.remove_listener('download-error', this.onDownloadError as (p: never) => void)
      void (async () => {
        try {
          await emu.stop()
          await emu.destroy?.()
        } catch {
          // Already torn down; nothing left to free.
        }
      })()
    }
    return flushed
  }

  /** Wires overlay restore, periodic capture, debounced saves and the pagehide save. */
  private setupOverlay(emu: V86Emulator): void {
    const ov = this.opts.overlay
    this.disk = hdaFromEmulator(emu)
    if (!ov || !this.disk) return
    if (ov.blocks.size > 0) restoreBlocks(this.disk, ov.blocks)
    this.overlay = new BlockOverlay()
    const disk = this.disk
    this.flusher = createFlusher({
      save: async () => {
        captureDirty(disk, this.overlay!)
        await ov.store.save(ov.buildId, this.overlay!.takeDirty())
      },
      onError: (e) => this.handlers.onStorageError?.(e),
    })
    this.capture = setInterval(() => {
      captureDirty(disk, this.overlay!)
      if (this.overlay!.dirty().length > 0) this.flusher?.schedule()
    }, CAPTURE_INTERVAL_MS)
    window.addEventListener('pagehide', this.onPageHide)
  }

  /** Captures and saves right away. Used on pagehide and stop, so the last changes are not lost. */
  private saveNow(): void {
    if (!this.flusher || !this.disk || !this.overlay) return
    captureDirty(this.disk, this.overlay)
    this.flusher.schedule()
  }

  private onPageHide = (): void => {
    if (!this.flusher || !this.disk || !this.overlay) return
    captureDirty(this.disk, this.overlay)
    this.flusher.schedule()
    void this.flusher.flushNow()
  }

  private fail(reason: string): void {
    if (this.stopped) return
    this.stop()
    this.handlers.onFailed(reason)
  }

  private onDownloadError = (e: { file_name: string }): void => {
    this.fail(`failed to download ${e.file_name}`)
  }

  private onByte = (byte: number): void => {
    if (this.stopped) return
    const text = this.decoder.decode(Uint8Array.of(byte), { stream: true })
    if (!text) return
    this.handlers.onOutput(text)
    this.tail = (this.tail + text).slice(-64)
    if (!this.booted && this.tail.includes('login:')) {
      this.booted = true
      this.watchdog?.clear()
      this.watchdog = null
      this.handlers.onBooted()
    } else if (this.booted && !this.shellReady && /localhost:[^\n]*# $/.test(this.tail)) {
      this.shellReady = true
      this.handlers.onShell()
    }
  }
}
