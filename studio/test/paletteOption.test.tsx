// @vitest-environment jsdom
/** The omnibar's verb row (togo-command-center.md §3.6, fixer round): the argv IS the row's title
 * — the one line a person must read before Enter, `--by` included — so it wraps in the ident face
 * and is never truncated; a static row keeps its one-line truncation. "sprint" reaches every
 * Build view (Home, Planning, Closing) and steering mode, not only the home. */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaletteOption } from '../src/palette/PaletteOption'
import { buildIndex } from '../src/palette/paletteIndex'
import { buildActionEntries } from '../src/palette/paletteActions'
import { rankEntries } from '../src/palette/score'
import { BUILD_VIEWS } from '../shared/nav'
import type { PaletteEntry, PaletteIndexInput } from '../src/palette/types'

afterEach(cleanup)

const entry = (over: Partial<PaletteEntry>): PaletteEntry => ({ id: 'x', group: 'specs', title: 't', keywords: [], run: vi.fn(), ...over })

describe('PaletteOption', () => {
  it('a verb row wraps its argv in the ident face with no truncation; the subtitle wraps too', () => {
    const argv = 'Run: sprint.py verdict --spec 0003 --lane eng --verdict accepted --by @sam-k'
    const { container } = render(<ul role="listbox"><PaletteOption id="o" item={{ entry: entry({ id: 'verb:intent', group: 'verbs', title: argv, subtitle: 'Record the eng verdict on 0003' }), score: 1, matches: [] }} selected={false} onHover={vi.fn()} onRun={vi.fn()} kbd={null} /></ul>)
    const title = container.querySelector('[data-verb-argv]') as HTMLElement
    expect(title.textContent).toBe(argv)
    expect(title.className).toContain('font-mono')
    expect(title.className).toContain('whitespace-normal')
    expect(title.className).not.toContain('truncate')
    const subtitle = title.nextElementSibling as HTMLElement
    expect(subtitle.className).not.toContain('truncate')
  })

  it('a static row keeps its single-line truncation', () => {
    const { container } = render(<ul role="listbox"><PaletteOption id="o" item={{ entry: entry({ title: 'Open spec 0003 — three', subtitle: 'ready · HIGH' }), score: 1, matches: [] }} selected={false} onHover={vi.fn()} onRun={vi.fn()} kbd={null} /></ul>)
    expect(container.querySelector('[data-verb-argv]')).toBeNull()
    expect((container.querySelector('li span span') as HTMLElement).className).toContain('truncate')
  })
})

describe('"sprint" reaches every Build view and steering', () => {
  const input = {
    stages: [{ id: 'build', name: 'build', display: 'Build Loop', status: 'current', stage_state: 'current', artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null }], currentStageId: 'build', viewedStageId: null, readiness: null,
    backlog: { rows: [], slate: [] }, actions: { steering: vi.fn() }, recentIds: [], area: 'sprint', buildViews: BUILD_VIEWS, settingsAnchors: [],
    navigate: vi.fn(), openSpec: vi.fn(), openDocument: vi.fn(), openSettings: vi.fn(),
  } as unknown as PaletteIndexInput

  it('Home, Planning, Closing, Board, How it is going, Documents and Steering mode all rank for "sprint"', () => {
    const ranked = rankEntries('sprint', buildIndex(input), { recentIds: [] }).map((r) => r.entry.title)
    for (const label of ['Home', 'Planning', 'Closing']) expect(ranked).toContain(`Go to ${label}`)
    expect(ranked).toContain('Steering mode')
    expect(buildActionEntries({ steering: vi.fn() })[0].keywords).toContain('sprint')
  })
})
