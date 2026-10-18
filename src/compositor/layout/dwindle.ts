export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Gaps {
  inner: number
  outer: number
}

/**
 * Hyprland's default dwindle layout: the first window fills the area, each
 * following window splits the previous one in half — side by side when the
 * rect is wide, stacked when it is tall. Sizes never drop below 1px.
 */
export function dwindle(ids: string[], area: Rect, gaps: Gaps): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  if (!ids.length) return out
  let cur: Rect = {
    x: area.x + gaps.outer,
    y: area.y + gaps.outer,
    w: Math.max(1, area.w - 2 * gaps.outer),
    h: Math.max(1, area.h - 2 * gaps.outer),
  }
  for (let i = 0; i < ids.length; i++) {
    if (i === ids.length - 1) {
      out[ids[i]] = cur
      break
    }
    let first: Rect
    let rest: Rect
    if (cur.w >= cur.h) {
      const w = Math.max(1, Math.floor((cur.w - gaps.inner) / 2))
      first = { ...cur, w }
      rest = { ...cur, x: cur.x + w + gaps.inner, w: Math.max(1, cur.w - w - gaps.inner) }
    } else {
      const h = Math.max(1, Math.floor((cur.h - gaps.inner) / 2))
      first = { ...cur, h }
      rest = { ...cur, y: cur.y + h + gaps.inner, h: Math.max(1, cur.h - h - gaps.inner) }
    }
    out[ids[i]] = first
    cur = rest
  }
  return out
}
