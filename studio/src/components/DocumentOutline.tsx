import type { DocumentSection, ReadinessFinding } from '../../shared/types'
import { matchesSection } from '../../shared/sections'
import { Chip, Eyebrow, cn } from '../ui'

/** The document outline rail (round 2, S5): one entry per headed section of the open document,
 * with the stage's readiness findings for that section counted beside it as a warn `Chip` ("N to
 * fill"). A `<nav>`, never an `<aside>` (the a11y suite counts exactly two asides); the count is
 * the plugin's own findings joined to a section with the SAME rule the main process used to
 * attach them (`shared/sections.ts`), so the rail and the "What is missing" list can never
 * disagree. Clicking an entry is the host's to act on — `DocumentView` scrolls to the card and
 * plays the existing `findingFocus` ring, so there is still exactly one `[data-highlighted]`. */

export interface DocumentOutlineProps {
  sections: DocumentSection[]
  /** The stage's readiness findings; only those for `relPath` are counted. */
  findings: ReadinessFinding[]
  relPath: string
  /** The section currently marked, for `aria-current="true"` (never "page" — the shell owns that). */
  activeKey: string | null
  onSelect: (key: string) => void
  className?: string
}

/** Findings per section key, each finding counted once against the first section it matches. */
export function outlineCounts(sections: DocumentSection[], findings: ReadinessFinding[], relPath: string): Map<string, number> {
  const counts = new Map<string, number>()
  const name = relPath.split('/').pop() ?? relPath
  for (const f of findings) {
    if (f.path !== relPath && f.path !== name) continue
    const hit = sections.find((s) => matchesSection(s.key, s.heading, f.section))
    if (hit) counts.set(hit.key, (counts.get(hit.key) ?? 0) + 1)
  }
  return counts
}

export function DocumentOutline({ sections, findings, relPath, activeKey, onSelect, className }: DocumentOutlineProps) {
  // Free text has no heading to list; the rail is the document's own section headings.
  const headed = sections.filter((s) => s.kind !== 'free_text' && s.heading.trim() !== '')
  if (headed.length === 0) return null
  const counts = outlineCounts(headed, findings, relPath)
  return (
    <nav aria-label="Document outline" data-testid="document-outline" className={cn('w-[220px] shrink-0', className)}>
      <Eyebrow as="p">On this page</Eyebrow>
      <ul className="mt-2 space-y-0.5">
        {headed.map((s) => {
          const n = counts.get(s.key) ?? 0
          const active = s.key === activeKey
          return (
            <li key={s.key}>
              <button
                type="button"
                data-pressable=""
                data-outline-key={s.key}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(s.key)}
                className={cn(
                  'flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink-1',
                  active && 'bg-surface-2 text-ink-1',
                )}
              >
                <span className="min-w-0 truncate">{s.heading}</span>
                {n > 0 && <Chip tone="warn" dot size="xs" className="shrink-0">{n} to fill</Chip>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
