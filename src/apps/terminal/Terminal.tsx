import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { createShell } from '../../kernel/shell/shell'
import type { AppCtx } from '../registry'
import { createLineEditor } from './lineEditor'
import './Terminal.css'

const MOTD = 'Welcome to \x1b[1;36mriceboot\x1b[0m! Type \x1b[1;35mhelp\x1b[0m or \x1b[1;35mfastfetch\x1b[0m to get started.\r\n\r\n'

export default function Terminal({ vfs, tokens, setTitle, wm }: AppCtx) {
  const host = useRef<HTMLDivElement>(null)

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
    let busy = false
    const editor = createLineEditor({
      write: (s) => term.write(s),
      onSubmit: async (line) => {
        busy = true
        await shell.run(line)
        busy = false
        updateTitle()
        term.write(shell.prompt())
      },
    })
    const sub = term.onData((d) => {
      if (!busy) editor.feed(d)
    })

    term.write(MOTD + shell.prompt())
    updateTitle()
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // element not laid out yet
      }
    })
    ro.observe(el)
    term.focus()
    return () => {
      ro.disconnect()
      sub.dispose()
      term.dispose()
    }
  }, [vfs, tokens, setTitle, wm])

  return <div className="app-terminal" ref={host} data-testid="terminal" />
}
