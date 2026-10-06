// The meeting point between the Sidebar and the sign-off ceremony (studio-upgrade-2 M1). The
// Sidebar registers GETTERS for the nodes the ceremony moves — the node just signed, its
// connector, the next ring, the Now badge, the progress bar and the bar's fraction before the
// sign-off — so a re-render between the plugin's `ok` and the first frame never leaves a stale
// element in the timeline. `SignOffPanel` resolves them when it plays.
//
// `hold()` is how the ceremony owns the bar for that second: while any holder is outstanding,
// `sidebarProgress` applies its end state instead of tweening, otherwise the two would fight
// over the same width. Re-entrant, so two overlapping holders release independently.
//
// A module store with no React: Sidebar and SignOffPanel share no parent that could hold it, and
// a test can drive it with hand-built getters. No `window.studio` here (noNewIpcInRenderer).
import type { CeremonyRegistryApi, CeremonyRegistryGetters, CeremonyRegistryKey, CeremonyRegistryRefs } from './contract'

const KEYS: readonly CeremonyRegistryKey[] = ['signedNode', 'connector', 'nextRing', 'nowBadge', 'bar', 'fromFraction']

export function createCeremonyRegistry(): CeremonyRegistryApi & { reset(): void } {
  const registrations = new Set<Partial<CeremonyRegistryGetters>>()
  let holders = 0

  function resolveKey<K extends CeremonyRegistryKey>(key: K): CeremonyRegistryRefs[K] {
    // The latest registration wins; a Sidebar remount registers again and the stale one is
    // unregistered by its own cleanup, so there is normally exactly one.
    const list = Array.from(registrations)
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const getter = list[i][key]
      if (typeof getter === 'function') {
        try {
          return (getter as () => CeremonyRegistryRefs[K])()
        } catch {
          // A getter that throws (detached node, no DOM) reads as absent.
        }
      }
    }
    return null as CeremonyRegistryRefs[K]
  }

  return {
    register(getters) {
      registrations.add(getters)
      return () => {
        registrations.delete(getters)
      }
    },
    resolve() {
      const out = {} as CeremonyRegistryRefs
      for (const key of KEYS) {
        ;(out as Record<CeremonyRegistryKey, unknown>)[key] = resolveKey(key)
      }
      return out
    },
    hold() {
      holders += 1
      let released = false
      return () => {
        if (released) return
        released = true
        holders = Math.max(0, holders - 1)
      }
    },
    held() {
      return holders > 0
    },
    reset() {
      registrations.clear()
      holders = 0
    },
  }
}

/** The one registry the shell uses. `reset()` is for tests. */
export const ceremonyRegistry = createCeremonyRegistry()
