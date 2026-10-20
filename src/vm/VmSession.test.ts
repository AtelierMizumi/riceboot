import { beforeEach, expect, test, vi } from 'vitest'
import { VmSession } from './VmSession'

type Listener = (payload: unknown) => void

function fakeEmu() {
  const listeners = new Map<string, Set<Listener>>()
  const emu = {
    add_listener: (ev: string, cb: Listener) => void (listeners.get(ev) ?? listeners.set(ev, new Set()).get(ev)!).add(cb),
    remove_listener: (ev: string, cb: Listener) => void listeners.get(ev)?.delete(cb),
    serial0_send: vi.fn(),
    stop: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    emit: (ev: string, payload: unknown) => [...(listeners.get(ev) ?? [])].forEach((cb) => cb(payload)),
  }
  return emu
}

const manifest = {
  buildId: 'b',
  cdrom: { base: 'alpine', ext: '.iso', size: 1048576 },
  hda: { base: 'rice', ext: '.img', size: 1048576 },
  packages: [],
}

let emu: ReturnType<typeof fakeEmu>
let create: ReturnType<typeof vi.fn<(o: object) => ReturnType<typeof fakeEmu>>>
let handlers: { onOutput: ReturnType<typeof vi.fn<(t: string) => void>>; onBooted: ReturnType<typeof vi.fn<() => void>>; onShell: ReturnType<typeof vi.fn<() => void>>; onFailed: ReturnType<typeof vi.fn<(r: string) => void>> }

beforeEach(() => {
  vi.useFakeTimers()
  emu = fakeEmu()
  create = vi.fn<(o: object) => ReturnType<typeof fakeEmu>>(() => emu)
  handlers = { onOutput: vi.fn<(t: string) => void>(), onBooted: vi.fn<() => void>(), onShell: vi.fn<() => void>(), onFailed: vi.fn<(r: string) => void>() }
})

const session = () => new VmSession({ baseUrl: '/vm/', manifest }, handlers, { load: async () => {}, create: create as never })

test('stop removes the listener, stops and destroys the emulator, and silences output', async () => {
  const s = session()
  await s.start()
  s.stop()
  await vi.runAllTimersAsync()
  expect(emu.stop).toHaveBeenCalled()
  expect(emu.destroy).toHaveBeenCalled()
  emu.emit('serial0-output-byte', 65)
  expect(handlers.onOutput).not.toHaveBeenCalled()
})

test('start after stop creates no emulator', async () => {
  const s = session()
  s.stop()
  await s.start()
  expect(create).not.toHaveBeenCalled()
})

test('a boot that never reaches login fails after the watchdog and frees the emulator', async () => {
  const s = session()
  await s.start()
  vi.advanceTimersByTime(180_000)
  await vi.runAllTimersAsync()
  expect(handlers.onFailed).toHaveBeenCalledWith('boot timed out')
  expect(emu.destroy).toHaveBeenCalled()
})

test('reaching login cancels the watchdog', async () => {
  const s = session()
  await s.start()
  for (const ch of 'localhost login: ') emu.emit('serial0-output-byte', ch.charCodeAt(0))
  vi.advanceTimersByTime(300_000)
  await vi.runAllTimersAsync()
  expect(handlers.onBooted).toHaveBeenCalledTimes(1)
  expect(handlers.onFailed).not.toHaveBeenCalled()
})

test('a failed part download fails the session with the file name', async () => {
  const s = session()
  await s.start()
  emu.emit('download-error', { file_index: 3, file_count: 9, file_name: 'rice-1048576-2097152.img', request: null })
  await vi.runAllTimersAsync()
  expect(handlers.onFailed).toHaveBeenCalledWith(expect.stringContaining('rice-1048576-2097152.img'))
  expect(emu.destroy).toHaveBeenCalled()
})
