import { describe, expect, it } from 'vitest'
import { activity, readinessWith as readiness } from './activityFixtures'
import { computeActivityRows } from '../src/workflowSteps'

describe('computeActivityRows', () => {
  it('returns nothing for an older plugin that emits no activities key, so the tab stays as it was', () => {
    expect(computeActivityRows(readiness({}))).toEqual([])
    expect(computeActivityRows(readiness({ capabilities: ['activities'] }))).toEqual([])
  })

  it('does not draw run, draft, or a check Studio has no control for', () => {
    const rows = computeActivityRows(readiness({
      capabilities: ['activities', 'rules-check'],
      activities: [
        activity({ id: 'intake', kind: 'run' }),
        activity({ id: 'brief', kind: 'draft' }),
        activity({ id: 'mystery-check', kind: 'check' }),
        activity({ id: 'rules-check', kind: 'check' }),
      ],
    }))
    expect(rows.map((r) => r.activity.id)).toEqual(['rules-check'])
  })

  it("keeps the plugin's declared order", () => {
    const rows = computeActivityRows(readiness({
      capabilities: ['activities', 'rules-check', 'data-contract-summary'],
      activities: [
        activity({ id: 'talk-b', kind: 'talk' }),
        activity({ id: 'data-check', kind: 'check' }),
        activity({ id: 'create-a', kind: 'create' }),
        activity({ id: 'rules-check', kind: 'check' }),
      ],
    }))
    expect(rows.map((r) => r.activity.id)).toEqual(['talk-b', 'data-check', 'create-a', 'rules-check'])
  })

  it("carries the plugin's blocked reason verbatim and its status", () => {
    const reason = 'Needs requirements.md to be started first.'
    const [row] = computeActivityRows(readiness({
      capabilities: ['activities'],
      activities: [activity({ id: 'rules', status: 'blocked', reason })],
    }))
    expect(row.status).toBe('blocked')
    expect(row.reason).toBe(reason)
    expect(row.disabledReason).toBeNull()
  })

  it('disables a check whose capability the plugin does not list, naming what is missing', () => {
    const [row] = computeActivityRows(readiness({
      capabilities: ['activities'],
      activities: [activity({ id: 'rules-check', kind: 'check' })],
    }))
    expect(row.disabledReason).toBe('needs a newer plugin: lacks rules-check')
  })

  it('enables a check whose capability the plugin lists', () => {
    const [row] = computeActivityRows(readiness({
      capabilities: ['activities', 'rules-check'],
      activities: [activity({ id: 'rules-check', kind: 'check' })],
    }))
    expect(row.disabledReason).toBeNull()
  })

  it('treats a check as unsupported when capabilities is undefined, but not create or talk', () => {
    const rows = computeActivityRows(readiness({
      activities: [
        activity({ id: 'rules-check', kind: 'check' }),
        activity({ id: 'data', kind: 'create' }),
        activity({ id: 'chat', kind: 'talk' }),
      ],
    }))
    expect(rows.map((r) => r.disabledReason)).toEqual([
      'needs a newer plugin: lacks rules-check', null, null,
    ])
  })

  it('disables create and talk when the plugin lists capabilities without activities', () => {
    const rows = computeActivityRows(readiness({
      capabilities: [],
      activities: [activity({ id: 'data', kind: 'create' })],
    }))
    expect(rows[0].disabledReason).toBe('needs a newer plugin: lacks activities')
  })
})
