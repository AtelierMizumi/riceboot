import { useEffect, useState } from 'react'
import { useWm } from '../../compositor/context'
import './Bar.css'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

const pad = (n: number) => String(n).padStart(2, '0')

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path d={d} fill="currentColor" />
  </svg>
)

const ICONS = {
  arch: 'M12 2c-.9 2.2-1.4 3.6-2.4 5.7.6.6 1.4 1.3 2.6 2.2-1.3-.6-2.2-1.1-2.9-1.7C7.9 11 5.9 14.8 3 20c2.3-1.3 4.1-2.2 5.8-2.5a4 4 0 0 1-.1-1c0-2.3 1.5-4 3.3-4s3.2 1.8 3.2 4.1l-.1.9c1.7.3 3.4 1.2 5.9 2.5-.5-1-1-1.8-1.4-2.6-.8-.6-1.6-1.4-3.2-2.2 1.1.3 1.9.6 2.5 1C16 9.6 14.2 6.3 12 2Z',
  net: 'M12 18.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM5.6 13.2a9 9 0 0 1 12.8 0l-1.4 1.4a7 7 0 0 0-10 0Zm-2.9-2.8a13 13 0 0 1 18.6 0l-1.4 1.4a11 11 0 0 0-15.8 0Z',
  vol: 'M3 9h4l5-4v14l-5-4H3Zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z',
  bat: 'M16 6h2v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h11Zm-10 4v7h9v-7Z',
}

export default function Bar({ height }: { height: number }) {
  const active = useWm((s) => s.active)
  const windows = useWm((s) => s.windows)
  const focused = useWm((s) => s.focused)
  const switchWorkspace = useWm((s) => s.switchWorkspace)
  const now = useClock()

  const occupied = new Set(Object.values(windows).map((w) => w.workspace))
  const shown = [1, 2, 3, 4, 5, ...[...occupied].filter((n) => n > 5)].sort((a, b) => a - b)
  if (active > 5 && !shown.includes(active)) shown.push(active)
  const title = focused ? windows[focused]?.title : ''

  return (
    <header className="hb-bar" data-testid="bar" style={{ height }}>
      <div className="hb-left">
        <span className="hb-logo" aria-hidden="true">
          <Icon d={ICONS.arch} />
        </span>
        <nav className="hb-ws">
          {shown.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`workspace ${n}`}
              aria-current={n === active ? 'true' : undefined}
              className={`hb-ws-btn${occupied.has(n) ? ' occupied' : ''}${n === active ? ' active' : ''}`}
              onClick={() => switchWorkspace(n)}
            >
              {n}
            </button>
          ))}
        </nav>
      </div>
      <div className="hb-center">{title}</div>
      <div className="hb-right">
        <span className="hb-pill">
          <Icon d={ICONS.net} /> <Icon d={ICONS.vol} /> <Icon d={ICONS.bat} /> 87%
        </span>
        <span className="hb-pill hb-clock" data-testid="clock">
          {pad(now.getHours())}:{pad(now.getMinutes())}
        </span>
      </div>
    </header>
  )
}
