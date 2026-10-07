// @vitest-environment jsdom
/** `src/scenes/registerAll.ts` is what `main.tsx` imports for its side effect. Two promises: every
 * `SceneId` has a loader afterwards, and importing the file evaluates NO scene module — a scene's
 * code (and three/fiber under it) is fetched on the first slot mount, never at boot. The module
 * factories below are the probe: vitest runs a `vi.mock` factory only when the mocked module is
 * actually imported, so a counter in each tells us when (if) the dynamic import happened. The
 * spine keeps its real implementation (via `importActual`) so the slot can be seen rendering the
 * real table surface in jsdom, where `DEFAULT_SURFACE` is `table`.
 *
 * No `vi.resetModules()` here on purpose: the registry is a module singleton, and resetting would
 * hand `registerAll` a fresh, empty copy the static imports below never see. */

import { render, screen, within } from '@testing-library/react'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { ProjectStage } from '../../shared/types'
import { SceneSlot } from '../../src/scenes/core/SceneSlot'
import { clearSceneRegistry, getScene } from '../../src/scenes/core/sceneRegistry'
import type { SceneId } from '../../src/scenes/core/types'
import { buildSpineData } from '../../src/scenes/spine/spineModel'
// The import under test. Hoisted `vi.mock`s above it (below in source order) still apply.
import '../../src/scenes/registerAll'

const probe = vi.hoisted(() => ({ spine: 0, constellation: 0, ambient: 0 }))

vi.mock('../../src/scenes/spine/LifecycleSpine', async (importOriginal) => {
  probe.spine += 1
  return importOriginal()
})
vi.mock('../../src/scenes/constellation/DependencyConstellation', () => {
  probe.constellation += 1
  return { default: () => <div data-testid="constellation-stub" /> }
})
vi.mock('../../src/scenes/ambient/AmbientField', () => {
  probe.ambient += 1
  return { default: () => null }
})

const ALL_IDS: readonly SceneId[] = ['spine', 'constellation-sprint', 'constellation-board', 'ambient']

function stage(id: string, index: number, state: ProjectStage['stage_state']): ProjectStage {
  return {
    id, display: `Phase ${id}`, stage_state: state, signed_off_by: state === 'signed_off' ? 'Priya N' : null,
    entered_at: null, completed_at: null, artifact_count: index,
  } as ProjectStage
}

afterAll(() => {
  clearSceneRegistry()
})

describe('registerAll', () => {
  it('registers all four scene ids without evaluating a single scene module', () => {
    for (const id of ALL_IDS) expect(getScene(id), `no loader registered for "${id}"`).toBeDefined()
    // The loaders are lazy: importing the registry touched none of the scene modules.
    expect(probe).toEqual({ spine: 0, constellation: 0, ambient: 0 })
  })

  it('SceneSlot renders the registered spine on its table surface, loading the module only then', async () => {
    const data = buildSpineData({
      stages: [stage('0', 0, 'signed_off'), stage('1', 1, 'current'), stage('2', 2, 'later')],
      currentPhaseId: '1',
    })
    render(<SceneSlot id="spine" data={data} onActivate={() => {}} />)

    // Suspense resolves the lazy import; the real LifecycleSpine's shell and table appear.
    const figure = await screen.findByTestId('lifecycle-spine')
    expect(figure.getAttribute('data-surface')).toBe('table')
    expect(within(figure).getByRole('list', { name: 'Lifecycle' })).toBeTruthy()
    expect(within(figure).getAllByRole('button', { name: /Phase/ })).toHaveLength(3)
    expect(probe.spine).toBe(1)
    // Rendering one scene never pulls in the others.
    expect(probe.constellation).toBe(0)
    expect(probe.ambient).toBe(0)
  })
})
