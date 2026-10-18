import { useEffect, useState, type CSSProperties } from 'react'
import { prefetchApps } from '../apps/registry'
import { createAnimator } from '../compositor/animator'
import { WmProvider, useWm } from '../compositor/context'
import { createDispatcher, DEFAULT_BINDINGS, type Action } from '../compositor/keybinds'
import { createWmStore, type WmStore } from '../compositor/store'
import Window from '../compositor/Window'
import type { Vfs } from '../kernel/vfs'
import type { ThemePack } from '../themes'
import './Desktop.css'

function runAction(store: WmStore, a: Action) {
  const s = store.getState()
  const [name, arg] = a.split(':')
  switch (name) {
    case 'exec':
      s.open(arg, 'kitty')
      return
    case 'killactive':
      s.killActive()
      return
    case 'togglefloating':
      if (s.focused) s.toggleFloating(s.focused)
      return
    case 'fullscreen':
      if (s.focused) s.toggleFullscreen(s.focused)
      return
    case 'workspace':
      s.switchWorkspace(Number(arg))
      return
    case 'movetoworkspace':
      if (s.focused) s.moveToWorkspace(s.focused, Number(arg))
      return
  }
}

function Windows({ vfs, theme, animator }: { vfs: Vfs; theme: ThemePack; animator: ReturnType<typeof createAnimator> }) {
  const windows = useWm((s) => s.windows)
  const empty = useWm((s) => !Object.values(s.windows).some((w) => w.workspace === s.active))
  return (
    <>
      {empty && (
        <div className="desk-hint">
          <kbd>Alt</kbd> + <kbd>Enter</kbd> — open terminal
        </div>
      )}
      {Object.values(windows).map((w) => (
        <Window key={w.id} win={w} vfs={vfs} theme={theme} animator={animator} />
      ))}
    </>
  )
}

export default function Desktop({ vfs, theme }: { vfs: Vfs; theme: ThemePack }) {
  const [store] = useState(createWmStore)
  const [animator] = useState(() => createAnimator())
  const { tokens, barHeight } = theme
  const Bar = theme.components.Bar

  useEffect(() => {
    store.getState().setGaps(tokens.gaps)
    const resize = () => store.getState().setArea({ x: 0, y: barHeight, w: innerWidth, h: innerHeight - barHeight })
    resize()
    window.addEventListener('resize', resize)
    // Capture phase so bindings win over focused apps (xterm eats keydown otherwise).
    const onKey = createDispatcher({ bindings: DEFAULT_BINDINGS, run: (a) => runAction(store, a) })
    window.addEventListener('keydown', onKey, true)
    prefetchApps(['terminal'])
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [store, tokens, barHeight])

  const vars = {
    '--bg': tokens.bg,
    '--fg': tokens.fg,
    '--accent': tokens.accent,
    '--accent2': tokens.accent2,
    '--border-inactive': tokens.borderInactive,
    '--radius': `${tokens.radius}px`,
    '--border-size': `${tokens.borderSize}px`,
    '--blur': `${tokens.blur}px`,
    '--font': tokens.font,
    background: theme.wallpaperCss,
  } as CSSProperties

  return (
    <WmProvider store={store}>
      <main className="desktop" data-testid="desktop" style={vars}>
        <Bar height={barHeight} />
        {!vfs.persistent && (
          <div className="desk-banner" data-testid="storage-banner" role="status">
            Storage is unavailable (private window?) — changes won't be saved.
          </div>
        )}
        <Windows vfs={vfs} theme={theme} animator={animator} />
      </main>
    </WmProvider>
  )
}
