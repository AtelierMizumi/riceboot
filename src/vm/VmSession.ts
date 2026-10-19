import { buildV86Options, type VmManifest } from './options'
import { sttyCommand } from './resize'
import { loadRuntime } from './runtime'

export interface VmSessionHandlers {
  onOutput(text: string): void
  onBooted(): void
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

  resize(cols: number, rows: number): void {
    this.write(sttyCommand(cols, rows))
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
    if (!this.booted) {
      this.tail = (this.tail + text).slice(-64)
      if (this.tail.includes('login:')) {
        this.booted = true
        this.handlers.onBooted()
      }
    }
  }
}
