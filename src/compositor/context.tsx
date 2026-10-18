import { createContext, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { WmState, WmStore } from './store'

const WmContext = createContext<WmStore | null>(null)

export function WmProvider({ store, children }: { store: WmStore; children: ReactNode }) {
  return <WmContext.Provider value={store}>{children}</WmContext.Provider>
}

export function useWmStore(): WmStore {
  const store = useContext(WmContext)
  if (!store) throw new Error('useWm must be used inside <WmProvider>')
  return store
}

/** Subscribe to a slice of window-manager state. */
export function useWm<T>(selector: (s: WmState) => T): T {
  return useStore(useWmStore(), selector)
}
