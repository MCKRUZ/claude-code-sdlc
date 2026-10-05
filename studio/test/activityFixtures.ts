import type { StageActivity, StageReadiness } from '../shared/types'

export function activity(over: Partial<StageActivity> & { id: string }): StageActivity {
  return {
    label: over.id,
    command: null,
    kind: 'create',
    optional: true,
    creates: [],
    after: [],
    status: 'available',
    reason: null,
    ...over,
  }
}

export function readinessWith(over: Partial<StageReadiness>): StageReadiness {
  return {
    ok: true, stageId: '1', name: 'requirements', display: 'Phase 1: Requirements', isCurrent: true,
    documents: [], findings: [], judgement: [],
    signOff: { status: 'pending', signedOffBy: null, completedAt: null },
    ready: true,
    ...over,
  }
}
