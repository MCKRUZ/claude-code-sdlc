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
