import { buildV86Options, type VmManifest } from './options'
import { startWatchdog } from './guards'
import { sttyCommand } from './resize'
import { loadRuntime as loadScript } from './runtime'

export interface VmSessionHandlers {
  onOutput(text: string): void
  /** The login prompt is up. Input typed now goes to getty, not a shell. */
  onBooted(): void
  /** A root shell prompt is up. Only now is it safe to send shell commands such as stty. */
  onShell(): void
  onFailed(reason: string): void
}

interface V86Emulator {
  add_listener(event: string, cb: (payload: never) => void): void
  remove_listener(event: string, cb: (payload: never) => void): void
  serial0_send(text: string): void
  stop(): Promise<void> | void
  destroy?(): Promise<void> | void
}

/** Seams for tests: the real runtime loader and emulator constructor are injected by default. */
export interface VmSessionDeps {
  load(src: string): Promise<void>
  create(options: object): V86Emulator
}

/** A login that has not appeared in this long is a failed boot (a stalled download, for example). */
export const BOOT_TIMEOUT_MS = 180_000

const defaultDeps: VmSessionDeps = {
  load: loadScript,
  create: (o) => new (window as unknown as { V86: new (o: object) => V86Emulator }).V86(o),
}

/** One v86 emulator: loads the runtime on start, streams serial output, and frees everything on stop. */
export class VmSession {
  private emu: V86Emulator | null = null
  private decoder = new TextDecoder('utf-8')
  private tail = ''
  private booted = false
  private shellReady = false
  private stopped = false
  private watchdog: { clear(): void } | null = null

  constructor(
    private readonly opts: { baseUrl: string; manifest: VmManifest },
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
      })
      const emu = this.deps.create(options)
      this.emu = emu
      emu.add_listener('serial0-output-byte', this.onByte as (p: never) => void)
      emu.add_listener('download-error', this.onDownloadError as (p: never) => void)
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

  /** Stops the emulator, removes its listeners and frees its memory. Idempotent. */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.watchdog?.clear()
    this.watchdog = null
    const emu = this.emu
    this.emu = null
    if (!emu) return
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
