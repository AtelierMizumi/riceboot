export type OverlayAction = 'restore' | 'start-empty' | 'ask-discard'

/** What to do with the overlay stored for `stored` when the running image is build `build`. */
export function overlayAction(stored: string | null, build: string): OverlayAction {
  if (stored === null) return 'start-empty'
  return stored === build ? 'restore' : 'ask-discard'
}
