// Which project the counters on screen belong to (§4 #11 / §5.4: a counter tweens only between
// two REAL values of the SAME fact). `valueMemory` is module-global and outlives a screen, which
// is right within one project — a tile that remounts should continue from the number it last
// showed — and wrong across two: project B's backlog is not a change to project A's. The hook
// scopes every `useCountUp` id by this key, so the memory cannot hand one project's number to
// another even if a caller forgets. App provides the open project's path; outside a project (and
// in a test that renders a counter bare) the key is empty and ids are unscoped.
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

const ProjectKeyContext = createContext<string>('')

export function ProjectKeyProvider({ value, children }: { value: string; children: ReactNode }) {
  return <ProjectKeyContext.Provider value={value}>{children}</ProjectKeyContext.Provider>
}

/** The open project's key, or '' when no project is open. */
export function useProjectKey(): string {
  return useContext(ProjectKeyContext)
}

/** The memory id a counter actually uses: `<project>::<id>` inside a project, `<id>` outside. */
export function scopedCounterId(projectKey: string, id: string): string {
  return projectKey ? `${projectKey}::${id}` : id
}
