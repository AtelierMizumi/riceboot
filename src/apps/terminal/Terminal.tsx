import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { createShell } from '../../kernel/shell/shell'
import { PACKAGE_BOOTSTRAP } from '../../vm/bootstrap'
import { createRunGuard, fetchManifest } from '../../vm/guards'
import { VmSession } from '../../vm/VmSession'
import { isVmSupported } from '../../vm/runtime'
import { nextMode, type ModeEvent, type ModeState } from '../../vm/terminalMode'
import type { AppCtx } from '../registry'
import { createLineEditor } from './lineEditor'
import './Terminal.css'

const MOTD = 'Welcome to \x1b[1;36mriceboot\x1b[0m! Type \x1b[1;35mhelp\x1b[0m or \x1b[1;35mfastfetch\x1b[0m to get started.\r\n\r\n'

export default function Terminal({ vfs, tokens, setTitle, wm }: AppCtx) {
  const host = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<ModeState>({ mode: 'shell' })
  const modeRef = useRef<ModeState>(mode)
  const dispatchRef = useRef<(e: ModeEvent) => void>(() => {})
  const focusRef = useRef<() => void>(() => {})

  useEffect(() => {
    const el = host.current
    if (!el) return
    const term = new XTerm({
      fontFamily: tokens.font,
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'bar',
      screenReaderMode: true,
      allowTransparency: true,
      theme: {
        background: '#00000000',
        foreground: tokens.fg,
        cursor: tokens.accent,
        selectionBackground: '#585b7066',
        black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
        blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
        brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
        brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // No WebGL: xterm keeps its DOM renderer.
    }

    const shell = createShell({ vfs, wm, io: { write: (s) => term.write(s), clear: () => term.clear() } })
    const updateTitle = () => setTitle(`user@archlinux: ${shell.cwd.replace(/^\/home\/user/, '~')}`)
    const editor = createLineEditor({
      write: (s) => term.write(s),
      onSubmit: async (line) => {
        try {
          await shell.run(line)
        } finally {
          updateTitle()
          term.write(shell.prompt())
        }
      },
      onInterrupt: () => term.write(shell.prompt()),
    })

    let session: VmSession | null = null
    // Every start gets a run id. Callbacks and awaits from an older run are dropped, so a stale VM cannot
    // write into the terminal or dispatch into a newer mode.
    const guard = createRunGuard()
    const runEffect = (effect: string) => {
      if (effect === 'show-unsupported') {
        term.write('\r\nReal Linux needs WebAssembly and about 300 MB of free memory. Staying in shell mode.\r\n' + shell.prompt())
      } else if (effect === 'start-vm') {
        session?.stop()
        session = null
        const run = guard.next()
        void (async () => {
          try {
            const manifest = await fetchManifest('/vm/manifest.json')
            if (!guard.isCurrent(run)) return
            const s = new VmSession(
              { baseUrl: '/vm/', manifest },
              {
                onOutput: (t) => guard.isCurrent(run) && term.write(t),
                onBooted: () => guard.isCurrent(run) && dispatchRef.current({ type: 'booted' }),
                onShell: () => {
                  if (!guard.isCurrent(run)) return
                  s.write(PACKAGE_BOOTSTRAP)
                  s.resize(term.cols, term.rows)
                },
                onFailed: (reason) => guard.isCurrent(run) && dispatchRef.current({ type: 'failed', reason }),
              },
            )
            session = s
            term.write('\r\nLoading Linux (the first start downloads about 70 MB)...\r\n')
            await s.start()
          } catch (e) {
            if (guard.isCurrent(run)) dispatchRef.current({ type: 'failed', reason: e instanceof Error ? e.message : String(e) })
          }
        })()
      } else if (effect === 'stop-vm') {
        guard.cancelAll()
        session?.stop()
        session = null
        term.write('\r\n' + shell.prompt())
      }
    }

    dispatchRef.current = (e) => {
      const r = nextMode(modeRef.current, e)
      modeRef.current = r.state
      setMode(r.state)
      for (const fx of r.effects) runEffect(fx)
      // Focus must leave the toolbar button, or keystrokes typed while loading go nowhere.
      if (r.state.mode === 'loading' || r.state.mode === 'linux') focusRef.current()
    }
    focusRef.current = () => term.focus()

    const sub = term.onData((d) => {
      if (modeRef.current.mode === 'linux') session?.write(d)
      else if (modeRef.current.mode === 'shell') editor.feed(d)
    })

    term.write(MOTD + shell.prompt())
    updateTitle()
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        if (modeRef.current.mode === 'linux') session?.resize(term.cols, term.rows)
      } catch {
        // element not laid out yet
      }
    })
    ro.observe(el)
    term.focus()
    return () => {
      ro.disconnect()
      sub.dispose()
      guard.cancelAll()
      session?.stop()
      session = null
      term.dispose()
    }
  }, [vfs, tokens, setTitle, wm])

  const supported = isVmSupported()
  return (
    <div className="term-wrap">
      <div className="term-bar" role="toolbar" aria-label="terminal mode">
        <button
          type="button"
          aria-pressed={mode.mode === 'shell'}
          onClick={() => dispatchRef.current({ type: 'leave' })}
        >
          shell
        </button>
        <button
          type="button"
          aria-pressed={mode.mode === 'linux' || mode.mode === 'loading'}
          onClick={() => dispatchRef.current({ type: 'request-linux', supported })}
        >
          linux
        </button>
        {mode.mode === 'loading' && <span className="term-status">loading…</span>}
        {mode.mode === 'error' && (
          <button type="button" onClick={() => dispatchRef.current({ type: 'retry', supported })}>
            retry
          </button>
        )}
        {mode.mode === 'error' && <span className="term-status term-error">{mode.reason}</span>}
      </div>
      <div className="app-terminal" ref={host} data-testid="terminal" />
    </div>
  )
}
