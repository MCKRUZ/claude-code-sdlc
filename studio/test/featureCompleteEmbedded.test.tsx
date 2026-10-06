// @vitest-environment jsdom
/** The declaration screen's blocker rows (fixer round): ink on a card with amber only on the
 * frame, the blocker's sentence and the "needs a decision" chip; the risk tier in the one risk
 * map; Defer right-aligned in its own grid column. Under `SprintClose` (`embedded`) the Spine
 * band is not drawn and the rows fold behind a count line that points to Carry / Drop above. */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeclarationStatus, ProjectStatus } from '../shared/types'
import { blockerFoldLabel, FeatureCompleteScreen } from '../src/components/FeatureCompleteScreen'

const STATUS: ProjectStatus = {
  project_name: 'demo', profile_id: 'p', current_phase: { id: 'build', display: 'Build Loop' },
  stages: [{ id: 'build', name: 'build', display: 'Build Loop', status: 'current', stage_state: 'current', artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null }],
}
const DECLARATION: DeclarationStatus = {
  ok: true, can_declare: false,
  blockers: [{
    kind: 'unfinished_specs', count: 2, message: '2 specs are neither merged nor deferred.',
    specs: [
      { spec: '0002', name: 'claim-export', status: 'ready', team: 'core', developer: null, risk: 'MEDIUM', intent: 'needs_a_call' },
      { spec: '0005', name: 'fraud-flags', status: 'in-flight', team: 'core', developer: '@sam-k', risk: 'HIGH' },
    ] as DeclarationStatus['blockers'][number]['specs'],
  }],
  unfinished: [], deferred: [], teamless: [], teams_in_list: ['core'], totals: { specs: 4, unfinished: 2, deferred: 0 },
}

function install() {
  // @ts-expect-error - partial test double
  window.studio = { getDeclarationStatus: vi.fn().mockResolvedValue(DECLARATION) }
}
afterEach(() => { cleanup(); delete (window as { studio?: unknown }).studio })

describe('FeatureCompleteScreen blocker rows', () => {
  it('rows are ink on a card, the tier a risk chip, Defer in the last column; amber marks only the frame, the sentence and the decision chip', async () => {
    install()
    render(<main><FeatureCompleteScreen projectPath="/p" actor="Matt K" buildStage={STATUS.stages[0]} status={STATUS} /></main>)
    await screen.findByText('2 specs are neither merged nor deferred.')
    const row = document.querySelector('[data-blocker-spec="0002"]') as HTMLElement
    expect(row.className).toContain('grid-cols-[auto_minmax(0,1fr)_auto]')
    expect(row.className).toContain('bg-surface-1')
    expect(row.querySelector('.font-mono')?.className).toContain('text-ink-2')
    expect(within(row).getByText('claim-export').className).toContain('text-ink-1')
    expect(within(row).getByText('MEDIUM').className).toContain('status-warn')
    expect(within(document.querySelector('[data-blocker-spec="0005"]') as HTMLElement).getByText('HIGH').className).toContain('status-error')
    expect(within(row).getByText('needs a decision').className).toContain('status-warn')
    expect(within(row).getByRole('button', { name: 'Defer' }).closest('.justify-self-end')).not.toBeNull()
    // No amber body text: the only warn ink in a row is the chip.
    expect(Array.from(row.querySelectorAll('.text-status-warn-ink')).every((el) => el.className.includes('rounded-full'))).toBe(true)
    expect(document.body.innerHTML).not.toContain('divide-amber-200')
    // Standalone: the rows are open, no fold.
    expect(screen.queryByTestId('blocker-specs-fold')).toBeNull()
  })

  it('embedded under the close screen: no Spine band, the rows folded behind a count line that points up, Defer still reachable', async () => {
    install()
    render(<main><FeatureCompleteScreen projectPath="/p" actor="Matt K" buildStage={STATUS.stages[0]} status={STATUS} embedded /></main>)
    await screen.findByText('2 specs are neither merged nor deferred.')
    expect(screen.queryByRole('region', { name: 'Lifecycle' })).toBeNull()
    const fold = screen.getByTestId('blocker-specs-fold') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(fold.textContent).toContain(blockerFoldLabel(2))
    expect(blockerFoldLabel(2)).toBe('2 open specs — carry or drop them above, or defer one here')
    expect(within(fold).getAllByRole('button', { name: 'Defer' })).toHaveLength(2)
  })
})
