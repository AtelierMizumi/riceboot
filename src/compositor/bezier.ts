/** CSS/Hyprland-style cubic bezier easing: control points (x1,y1) and (x2,y2). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const ax = 1 + 3 * x1 - 3 * x2
  const bx = 3 * x2 - 6 * x1
  const cx = 3 * x1
  const ay = 1 + 3 * y1 - 3 * y2
  const by = 3 * y2 - 6 * y1
  const cy = 3 * y1
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx

  // Find s such that sampleX(s) = x: Newton–Raphson, bisection fallback.
  const solve = (x: number) => {
    let s = x
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x
      if (Math.abs(err) < 1e-6) return s
      const d = slopeX(s)
      if (Math.abs(d) < 1e-6) break
      s -= err / d
    }
    let lo = 0
    let hi = 1
    s = x
    while (hi - lo > 1e-6) {
      if (sampleX(s) < x) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return s
  }

  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solve(t)))
}
