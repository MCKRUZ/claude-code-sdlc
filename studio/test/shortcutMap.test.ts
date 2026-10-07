// @vitest-environment jsdom
/** The command center's keys (togo-command-center.md §3.1, §7 P0): the `lanes` scope (`j k ↵ h v
 * Esc`), `g s` / `g p` as Build views, `g l` / `g t` as command-center sequences; no key clashes
 * across the whole table; the help lists `lanes`. */
import { describe, expect, it } from 'vitest'
import { helpRows } from '../src/components/ShortcutsHelp'
import {
  COMMAND_CENTER_BINDINGS, COMMAND_CENTER_SEQUENCES, commandCenterSequenceFor, inLaneScope, LANE_BINDINGS, LANE_SCOPE_VALUE,
  laneCommandFor, normalizeChord, SCENE_SCOPE_ATTR, SHORTCUT_MAP, SHORTCUT_SCOPE_LABEL, SHORTCUT_SCOPE_ORDER,
  type ShortcutBinding,
} from '../src/shortcuts/shortcutMap'

const key = (k: string, over: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over })

describe('the lanes scope', () => {
  it('is a scope with a heading, listed between the Board and the graph', () => {
    expect(SHORTCUT_SCOPE_ORDER).toContain('lanes')
    expect(SHORTCUT_SCOPE_LABEL.lanes).toBe('In the lanes')
    expect(SHORTCUT_SCOPE_ORDER.indexOf('lanes')).toBe(SHORTCUT_SCOPE_ORDER.indexOf('scene') - 1)
  })

  it('binds exactly j k Enter h v Esc, every one in the lanes scope', () => {
    expect(LANE_BINDINGS.map((b) => b.keys.join('+'))).toEqual(['j', 'k', 'Enter', 'h', 'v', 'Esc'])
    for (const b of LANE_BINDINGS) expect(b.scope).toBe('lanes')
    expect(LANE_BINDINGS.map((b) => b.action.type === 'lane' && b.action.command)).toEqual(['next', 'prev', 'open', 'handoff', 'verdict', 'clear'])
  })

  it('laneCommandFor reads the same table: a lane key resolves, Escape clears, anything else is null', () => {
    expect(laneCommandFor(key('j'), true)).toBe('next')
    expect(laneCommandFor(key('k'), true)).toBe('prev')
    expect(laneCommandFor(key('Enter'), true)).toBe('open')
    expect(laneCommandFor(key('h'), true)).toBe('handoff')
    expect(laneCommandFor(key('v'), true)).toBe('verdict')
    expect(laneCommandFor(key('Escape'), true)).toBe('clear')
    expect(laneCommandFor(key('j', { metaKey: true }), true)).toBeNull()
    expect(laneCommandFor(key('x'), true)).toBeNull()
    expect(laneCommandFor(key('Shift'), true)).toBeNull()
  })

  it('is live only inside [data-shortcut-scope="lanes"]', () => {
    const board = document.createElement('section')
    board.setAttribute(SCENE_SCOPE_ATTR, LANE_SCOPE_VALUE)
    const card = document.createElement('button')
    board.append(card)
    document.body.append(board)
    expect(inLaneScope(card)).toBe(true)
    expect(inLaneScope(document.body)).toBe(false)
    expect(inLaneScope(null)).toBe(false)
    board.remove()
  })

  it('the help lists the lanes section with one row per key', () => {
    const rows = helpRows(COMMAND_CENTER_BINDINGS as unknown as readonly ShortcutBinding[], 'lanes')
    expect(rows.map((r) => r.label)).toEqual(['Next card', 'Previous card', 'Open the card', 'Hand off', 'Record a verdict', 'Clear the focus'])
  })
})

describe('the g-chords', () => {
  const seq = (map: readonly ShortcutBinding<unknown>[], first: string, second: string) =>
    map.find((b) => b.keys.length === 2 && b.keys[0] === first && b.keys[1] === second)

  it('g s is the sprint home and g p planning — Build views in the main map, so they dispatch today', () => {
    expect(seq(SHORTCUT_MAP, 'g', 's')?.action).toEqual({ type: 'buildView', view: 'sprint' })
    expect(seq(SHORTCUT_MAP, 'g', 's')?.label).toBe('Go to the sprint home')
    expect(seq(SHORTCUT_MAP, 'g', 'p')?.action).toEqual({ type: 'buildView', view: 'planning' })
    for (const k of ['b', 'h', 'c', 'd']) expect(seq(SHORTCUT_MAP, 'g', k), `g ${k} keeps working`).toBeTruthy()
  })

  it('g l is the lifecycle home and g t steering mode — command-center sequences', () => {
    expect(seq(COMMAND_CENTER_SEQUENCES, 'g', 'l')?.action).toEqual({ type: 'home', home: 'lifecycle' })
    expect(seq(COMMAND_CENTER_SEQUENCES, 'g', 't')?.action).toEqual({ type: 'steering' })
    expect(commandCenterSequenceFor('g', 'l')).toEqual({ type: 'home', home: 'lifecycle' })
    expect(commandCenterSequenceFor('g', 't')).toEqual({ type: 'steering' })
    expect(commandCenterSequenceFor('g', 'z')).toBeNull()
  })
})

describe('no clash across the whole table', () => {
  it('no two bindings in overlapping scopes share a chord', () => {
    const all: ShortcutBinding<unknown>[] = [...SHORTCUT_MAP, ...COMMAND_CENTER_BINDINGS]
    const overlap = (a: string, b: string) => a === b || a === 'global' || b === 'global' || (['project', 'stageHome', 'documentView', 'board', 'lanes', 'scene'].includes(a) && b === 'project') || (a === 'project' && ['stageHome', 'documentView', 'board', 'lanes', 'scene'].includes(b))
    const sig = (b: ShortcutBinding<unknown>) => b.keys.map(normalizeChord).join(' ')
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i]; const b = all[j]
        if (sig(a) !== sig(b)) continue
        if (!overlap(a.scope, b.scope)) continue
        // Same chord in overlapping scopes is allowed only when it is the SAME action (an alias).
        expect(JSON.stringify(a.action), `${sig(a)}: ${a.label} vs ${b.label}`).toBe(JSON.stringify(b.action))
      }
    }
  })

  it('a lane key is never also a project-scope single key (j k h v would otherwise fire twice)', () => {
    const projectSingles = SHORTCUT_MAP.filter((b) => b.keys.length === 1 && (b.scope === 'project' || b.scope === 'global')).map((b) => normalizeChord(b.keys[0]))
    for (const b of LANE_BINDINGS) expect(projectSingles, b.keys[0]).not.toContain(normalizeChord(b.keys[0]))
  })

  it('the g-chords are all distinct second keys', () => {
    const seconds = [...SHORTCUT_MAP, ...COMMAND_CENTER_SEQUENCES].filter((b) => b.keys.length === 2 && b.keys[0] === 'g').map((b) => b.keys[1])
    expect(new Set(seconds).size).toBe(seconds.length)
    for (const k of ['s', 'l', 'p', 't', 'b', 'h', 'c', 'd']) expect(seconds).toContain(k)
  })
})

// --- Q4: the keyboard model, documented as data --------------------------------------------------

import { describeBindings, ESC_LAYERS, kbdFor, namedEscLayers } from '../src/shortcuts/shortcutMap'
import { ALL_BINDINGS } from '../src/shortcuts/useShortcuts'

describe('the Esc layering is one ordered list', () => {
  it('innermost first — dialog, palette, help, spec card, steering, lane focus, graph hover, Board search — and back last', () => {
    expect(ESC_LAYERS.map((l) => l.layer)).toEqual(['dialog', 'palette', 'help', 'spec-card', 'steering', 'lane-focus', 'graph-hover', 'board-search', 'back'])
    for (const l of ESC_LAYERS) expect(l.closes.length).toBeGreaterThan(8)
    expect(ESC_LAYERS[ESC_LAYERS.length - 1].closes).toMatch(/never while .* dirty/)
  })
  it('namedEscLayers orders whatever closers a host has by that list, never by the host\'s object order', () => {
    const calls: string[] = []
    const layers = namedEscLayers({ 'graph-hover': () => { calls.push('graph'); return false }, dialog: () => { calls.push('dialog'); return false }, palette: () => { calls.push('palette'); return true } })
    expect(layers).toHaveLength(3)
    for (const l of layers) if (l()) break
    expect(calls).toEqual(['dialog', 'palette'])
  })
})

describe('kbdFor: a control shows its own key from the one map', () => {
  it('finds the first binding of an action type, platform-resolved; unbound → null', () => {
    expect(kbdFor(ALL_BINDINGS, 'palette', undefined, true)).toEqual([['⌘', 'K']])
    expect(kbdFor(ALL_BINDINGS, 'palette', undefined, false)).toEqual([['Ctrl', 'K']])
    expect(kbdFor(ALL_BINDINGS, 'chat', undefined, true)).toEqual([['⌘', '\\']])
    expect(kbdFor(ALL_BINDINGS, 'lane', (a) => a.type === 'lane' && a.command === 'handoff')).toEqual([['h']])
    expect(kbdFor(ALL_BINDINGS, 'buildView', (a) => a.type === 'buildView' && a.view === 'planning')).toEqual([['g'], ['p']])
    expect(kbdFor(ALL_BINDINGS, 'steering')).toEqual([['g'], ['t']])
    expect(kbdFor([] as typeof ALL_BINDINGS, 'palette')).toBeNull()
  })
})

describe('describeBindings: the README table is generated from the map', () => {
  it('covers every scope, collapses alternatives and the g 0–9 run, and marks input-safe rows', () => {
    const rows = describeBindings(ALL_BINDINGS)
    const palette = rows.find((r) => r.does === 'Command palette')!
    expect(palette).toEqual({ keys: '`Mod+K`, `/`', where: 'Everywhere', does: 'Command palette', inInputs: true })
    expect(rows.filter((r) => /^Go to Phase/.test(r.does))).toEqual([{ keys: '`g` `0`…`g` `9`', where: 'In a project', does: 'Go to Phase 0–9', inInputs: false }])
    expect(rows.find((r) => r.does === 'Hand off')).toEqual({ keys: '`h`', where: 'In the lanes', does: 'Hand off', inInputs: false })
    expect(rows.find((r) => r.does === 'Steering mode')?.keys).toBe('`g` `t`')
    // Every scope that HAS a binding is a column value (the Board scope binds nothing: its search is a field, not a key).
    expect(new Set(rows.map((r) => r.where))).toEqual(new Set(ALL_BINDINGS.map((b) => SHORTCUT_SCOPE_LABEL[b.scope])))
  })
  it('no two bindings in one live scope set share a chord (the whole table, lanes and scene included)', () => {
    const seen = new Map<string, string>()
    for (const b of ALL_BINDINGS) {
      const id = `${b.scope}:${b.keys.map(normalizeChord).join(' ')}`
      const prev = seen.get(id)
      if (prev) expect(prev, id).toBe(b.label)   // the same label twice is an alias, not a clash
      seen.set(id, b.label)
    }
  })
})
