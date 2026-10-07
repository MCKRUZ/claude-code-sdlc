// React's view of `motion.ts` (§4.1 `MotionProvider`): the same facts, snapshotted through
// `useSyncExternalStore` so a Settings › Appearance control and the palette re-render when the
// preference or the OS setting changes. The provider is optional — `useMotion()` outside one
// reads the module directly — so a component test does not need to wrap in it.
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { MotionContextValue, MotionPreference } from './contract'
import { enabled, getPreference, reduced, setPreference, subscribe } from './motion'

const MotionContext = createContext<MotionContextValue | null>(null)

/** One string per distinct state, so `useSyncExternalStore` sees a change exactly when a fact
 * changed (an object snapshot would be new every call and loop). */
function snapshot(): string {
  return `${enabled() ? 1 : 0}${reduced() ? 1 : 0}${getPreference()}`
}

// Server render has no matchMedia or storage: disabled, not reduced, `auto`.
const SERVER_SNAPSHOT = '00auto'

function parse(snap: string): Omit<MotionContextValue, 'setPreference'> {
  return {
    enabled: snap[0] === '1',
    reduced: snap[1] === '1',
    preference: snap.slice(2) as MotionPreference,
  }
}

export function useMotionState(): MotionContextValue {
  const snap = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT)
  const set = useCallback((next: MotionPreference) => setPreference(next), [])
  return useMemo(() => ({ ...parse(snap), setPreference: set }), [snap, set])
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const value = useMotionState()
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
}

/** Inside a provider: the shared snapshot. Outside one: a private subscription to the same
 * module, so the hook is usable anywhere. */
export function useMotion(): MotionContextValue {
  const fromContext = useContext(MotionContext)
  const own = useMotionState()
  return fromContext ?? own
}
