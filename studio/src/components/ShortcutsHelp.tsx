// The Shortcuts help (studio-observatory.md §6.2): a Dialog that renders the shortcut table
// grouped by scope, so the help and the listener read the same table and cannot drift. Opened by
// ⌘/, `?`, the palette's "Keyboard shortcuts" row and the `…` menu. Never an `<aside>`, never an
// `<input>` — the shell's two pins hold with it open. Round 2 (I6): the "In a graph" group comes
// from the same `SCENE_BINDINGS` the figure's keydown reads — no second list. Command center:
// the default table is `ALL_BINDINGS`, so "In the lanes" (`j k ↵ h v Esc`) and the two homes
// (`g s` / `g l`) and steering (`g t`) are listed from the one map the listener dispatches.
import { useMemo } from 'react'
import { Dialog } from '../ui/Dialog'
import { Kbd } from '../ui/Kbd'
import { SHORTCUT_SCOPE_LABEL, SHORTCUT_SCOPE_ORDER, kbdKeys, type ShortcutScope } from '../shortcuts/shortcutMap'
import { ALL_BINDINGS, type AnyShortcutBinding } from '../shortcuts/useShortcuts'

export const SHORTCUTS_HELP_TITLE = 'Keyboard shortcuts'

interface HelpRow {
  label: string
  /** Alternatives, each a sequence of one or two steps. */
  chords: string[][]
}

const PHASE_ROW = /^Go to Phase \d$/

/** Rows for one scope: bindings that share a label collapse into one row with alternatives
 * (⌘K or /), and the ten `g` `0`…`9` sequences collapse into one `g` `0–9` row — eleven rows
 * that say the same thing teach less than one that says the pattern. */
export function helpRows(bindings: readonly AnyShortcutBinding[], scope: ShortcutScope): HelpRow[] {
  const rows = new Map<string, HelpRow>()
  for (const b of bindings) {
    if (b.scope !== scope) continue
    if (PHASE_ROW.test(b.label)) {
      const label = 'Go to Phase 0–9'
      if (!rows.has(label)) rows.set(label, { label, chords: [['g', '0–9']] })
      continue
    }
    const row = rows.get(b.label) ?? { label: b.label, chords: [] }
    row.chords.push(b.keys)
    rows.set(b.label, row)
  }
  return Array.from(rows.values())
}

function Chord({ steps }: { steps: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {steps.map((step, i) => (
        <span key={`${step}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-xs text-ink-4">then</span>}
          <Kbd keys={step === '0–9' ? [step] : kbdKeys(step)} />
        </span>
      ))}
    </span>
  )
}

export function ShortcutsHelp({ open, onClose, bindings = ALL_BINDINGS }: {
  open: boolean
  onClose: () => void
  bindings?: readonly AnyShortcutBinding[]
}) {
  const sections = useMemo(
    () => SHORTCUT_SCOPE_ORDER.map((scope) => ({ scope, rows: helpRows(bindings, scope) })).filter((s) => s.rows.length > 0),
    [bindings],
  )
  return (
    // Round 2 (I6 / M5): the Dialog's own `scrollBody` is the scroll box, so the header stays put
    // while the groups scroll — no second scroll container inside the body.
    <Dialog open={open} onClose={onClose} title={SHORTCUTS_HELP_TITLE} size="lg" scrollBody data-testid="shortcuts-help"
      description="Single keys are ignored while you are typing in a field.">
      <div className="space-y-5 pr-1">
        {sections.map(({ scope, rows }) => (
          <section key={scope} aria-labelledby={`shortcuts-${scope}`}>
            <h3 id={`shortcuts-${scope}`} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              {SHORTCUT_SCOPE_LABEL[scope]}
            </h3>
            <dl className="mt-2 divide-y divide-line-1">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="text-sm text-ink-1">{row.label}</dt>
                  <dd className="flex shrink-0 items-center gap-2">
                    {row.chords.map((chord, i) => (
                      <span key={i} className="inline-flex items-center gap-2">
                        {i > 0 && <span className="text-xs text-ink-4">or</span>}
                        <Chord steps={chord} />
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
