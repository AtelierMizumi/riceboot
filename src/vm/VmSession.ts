import { buildV86Options, type VmManifest } from './options'
import { sttyCommand } from './resize'
import { loadRuntime } from './runtime'

export interface VmSessionHandlers {
  onOutput(text: string): void
  /** The login prompt is up. Input typed now goes to getty, not a shell. */
  onBooted(): void
  /** A root shell prompt is up. Only now is it safe to send shell commands such as stty. */
  onShell(): void
  onFailed(reason: string): void
}

interface V86Emulator {
  add_listener(event: string, cb: (byte: number) => void): void
  remove_listener(event: string, cb: (byte: number) => void): void
  serial0_send(text: string): void
  stop(): Promise<void> | void
}

/** One v86 emulator: loads the runtime on start, streams serial output, and stops cleanly. */
export class VmSession {
  private emu: V86Emulator | null = null
  private decoder = new TextDecoder('utf-8')
  private tail = ''
  private booted = false
  private shellReady = false

  constructor(
    private readonly opts: { baseUrl: string; manifest: VmManifest },
    private readonly handlers: VmSessionHandlers,
  ) {}

  async start(): Promise<void> {
    try {
      await loadRuntime(`${this.opts.baseUrl}runtime/libv86.js`)
      const V86 = (window as unknown as { V86: new (o: object) => V86Emulator }).V86
      const options = buildV86Options({
        baseUrl: this.opts.baseUrl,
        manifest: this.opts.manifest,
        wasmPath: `${this.opts.baseUrl}runtime/v86.wasm`,
      })
      this.emu = new V86(options)
      this.emu.add_listener('serial0-output-byte', this.onByte)
    } catch (e) {
      this.handlers.onFailed(e instanceof Error ? e.message : String(e))
    }
  }

  write(text: string): void {
    this.emu?.serial0_send(text)
  }

  /** Sends the terminal size to the guest shell. A no-op until the shell prompt has appeared. */
  resize(cols: number, rows: number): void {
    if (this.shellReady) this.write(sttyCommand(cols, rows))
  }

  stop(): void {
    const emu = this.emu
    if (!emu) return
    this.emu = null
    emu.remove_listener('serial0-output-byte', this.onByte)
    void emu.stop()
  }

  private onByte = (byte: number): void => {
    const text = this.decoder.decode(Uint8Array.of(byte), { stream: true })
    if (!text) return
    this.handlers.onOutput(text)
    this.tail = (this.tail + text).slice(-64)
    if (!this.booted && this.tail.includes('login:')) {
      this.booted = true
      this.handlers.onBooted()
    } else if (this.booted && !this.shellReady && /localhost:[^\n]*# $/.test(this.tail)) {
      this.shellReady = true
      this.handlers.onShell()
    }
  }
}
