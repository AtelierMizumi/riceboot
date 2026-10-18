import { useEffect, useState } from 'react'
import { bootLines } from './bootLines'
import './Boot.css'

const LINES = bootLines()
const LINE_MS = 40

/** Fake systemd boot; finishes when the log has played and `ready` resolved. Any key skips the log. */
export default function Boot({ ready, onDone }: { ready: Promise<unknown>; onDone: () => void }) {
  const [shown, setShown] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ready.then(
      () => setLoaded(true),
      (e: unknown) => setError(String(e)),
    )
  }, [ready])

  useEffect(() => {
    if (shown >= LINES.length) return
    const t = setTimeout(() => setShown((n) => n + 1), LINE_MS)
    return () => clearTimeout(t)
  }, [shown])

  useEffect(() => {
    const skip = () => setShown(LINES.length)
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [])

  useEffect(() => {
    if (loaded && shown >= LINES.length) onDone()
  }, [loaded, shown, onDone])

  return (
    <div className="boot" role="log" aria-label="boot log">
      {LINES.slice(0, shown).map((l, i) => (
        <div key={i}>
          {l.startsWith('[  OK  ]') ? (
            <>
              [<span className="boot-ok">  OK  </span>]{l.slice(8)}
            </>
          ) : (
            <span className={i === 0 ? 'boot-welcome' : undefined}>{l || ' '}</span>
          )}
        </div>
      ))}
      {error && (
        <div>
          [<span className="boot-fail">FAILED</span>] Failed to start riceboot: {error}
        </div>
      )}
    </div>
  )
}
