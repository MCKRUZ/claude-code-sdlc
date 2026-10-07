/** The brandbook and the guides must describe the assets that exist and the rules the code
 * enforces (round 2, B5). The brandbook names the Depth sources and the packaged icon, no longer
 * shows a gradient as a "don't", and says where Depth may live; both guides carry the rule; the
 * user-guide template references only shots the capture produces (or P7's listed v8 additions),
 * and every brand file it names is on disk. Node only. */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const studio = resolve(__dirname, '..')
const repo = resolve(studio, '..')
const brandDir = join(repo, 'docs', 'brand', 'togo')
const guideDir = join(repo, 'docs', 'guide')
const brandbook = readFileSync(join(brandDir, 'brandbook.html'), 'utf8')
const template = readFileSync(join(guideDir, 'togo-user-guide.template.html'), 'utf8')
const setupGuide = readFileSync(join(guideDir, 'togo-setup-guide.html'), 'utf8')
const capture = readFileSync(join(studio, 'test', 'screenshots', 'capture-observatory-v2.mjs'), 'utf8')

/** The six shots P7's v8 run adds (studio-upgrade-2 §4 P7). Listed here so the template may
 * reference them before the capture script (P7's file) gains them. */
const V8_ADDITIONS = ['welcome-dark', 'palette-dark', 'spec-view-dark', 'settings-dark', 'board-graph', 'closing']

describe('brandbook', () => {
  it('names the Depth sources and the packaged icon', () => {
    for (const name of ['mark-a-macron-depth.svg', 'tile-depth.svg', 'studio/build/icon', 'build-assets.mjs']) {
      expect(brandbook, name).toContain(name)
    }
  })

  it('no longer lists a gradient as a don\'t; Depth is the one sanctioned treatment', () => {
    expect(brandbook).not.toContain('aria-label="Don\'t: gradient"')
    expect(brandbook).not.toMatch(/No gradients<span>flat colour only/)
    expect(brandbook).toContain('aria-label="Do: Depth at hero size"')
    expect(brandbook).toMatch(/48 px\+? · Depth allowed|Depth allowed/)
    expect(brandbook).toContain('<h3>Mark A — Depth</h3>')
    expect(brandbook).toContain('<h3>Signature motion</h3>')
  })

  it('states the construction the component uses: one user-space gradient on the 17/9 → 47/56 vector', () => {
    expect(brandbook).toContain('gradientUnits="userSpaceOnUse" x1="17" y1="9" x2="47" y2="56"')
    expect(brandbook).toContain('#6FD1D4')
    expect(brandbook).toContain('#0A3F47')
    expect(brandbook).toContain('#0E7C86')
  })

  it('the packaged-icon sentences agree with the pipeline\'s DEPTH_FROM_PX and ICO member list', () => {
    const pipeline = readFileSync(join(brandDir, 'build-assets.mjs'), 'utf8')
    const depthFrom = Number(pipeline.match(/export const DEPTH_FROM_PX = (\d+)/)![1])
    const icoSizes = pipeline.match(/export const ICO_SIZES = \[([\d,\s]+)\]/)![1]!.split(',').map((s) => Number(s.trim()))
    const flat = icoSizes.filter((s) => s < depthFrom)
    const depth = icoSizes.filter((s) => s >= depthFrom)
    expect(flat.length).toBeGreaterThan(0)
    expect(depth.length).toBeGreaterThan(0)
    const flatWords = flat.length === 1 ? `${flat[0]}` : `${flat.slice(0, -1).join(', ')} and ${flat[flat.length - 1]}`
    // "16, 32 and 48 flat, 64–256 Depth" — the ICO row, derived from the constants, not retyped.
    expect(brandbook).toContain(`${icoSizes.length === 6 ? 'six' : icoSizes.length} PNG members, ${flatWords} flat, ${depth[0]}–${depth[depth.length - 1]} Depth.`)
    // The ICNS row: every 1× / 2× slot below DEPTH_FROM_PX is flat; Depth starts at it.
    expect(brandbook).toContain(`Depth from ${depthFrom}.`)
    expect(brandbook).toMatch(new RegExp(`flat at ${[16, 32].filter((s) => s < depthFrom).join(' and ')}`))
  })

  it('every file the inventory names under docs/brand/togo exists', () => {
    const inventory = brandbook.slice(brandbook.indexOf('<h2 id="files">'))
    const names = new Set([...inventory.matchAll(/<code>((?:mark|tile|lockup|wordmark|palette|build-assets|brandbook)[a-z0-9-]*\.(?:svg|json|mjs|html))<\/code>/g)].map((m) => m[1]!))
    expect(names.size).toBeGreaterThan(8)
    for (const name of names) expect(existsSync(join(brandDir, name)), name).toBe(true)
  })
})

describe('guides', () => {
  it('both guides say where Depth may live', () => {
    for (const [name, text] of [['user guide', template], ['setup guide', setupGuide]] as const) {
      expect(text, name).toMatch(/Depth/)
      expect(text, name).toMatch(/Welcome hero/)
      expect(text, name).toMatch(/opening card|card that covers the window/)
      expect(text, name).toMatch(/app icon/)
      expect(text, name).toMatch(/never (appears )?on a control/)
    }
  })

  it('the user-guide template references exactly the shots the capture produces, plus the listed v8 additions', () => {
    const referenced = [...new Set([...template.matchAll(/\{\{shot:([a-z0-9-]+)\}\}/g)].map((m) => m[1]!))]
    const produced = new Set([...capture.matchAll(/shot\(page, '([a-z0-9-]+)'\)/g)].map((m) => m[1]!))
    expect(produced.size).toBeGreaterThanOrEqual(12)
    for (const name of referenced) {
      expect(produced.has(name) || V8_ADDITIONS.includes(name), `shot "${name}" is not produced by the capture`).toBe(true)
    }
    expect(referenced).toContain('welcome')
    expect(referenced).toContain('welcome-dark')
  })

  it('every command-center screen is captured in BOTH themes (visual §9 "dark and light shots both taken")', () => {
    const produced = new Set([...capture.matchAll(/shot\(page, '([a-z0-9-]+)'\)/g)].map((m) => m[1]!))
    // The light shot and its dark twin, per screen; steering is dark-first, so its twin is `-light`.
    const pairs: Array<[string, string]> = [
      ['sprint-home', 'sprint-home-dark'], ['sprint-graph', 'sprint-graph-dark'], ['sprint-table', 'sprint-table-dark'],
      ['planning', 'planning-dark'], ['spec-card', 'spec-card-dark'], ['stage-light', 'stage-dark'], ['lifecycle-home', 'lifecycle-home-dark'],
      ['board-list', 'board-list-dark'], ['board-graph', 'board-graph-dark'], ['palette', 'palette-dark'], ['settings', 'settings-dark'],
      ['spec-view', 'spec-view-dark'], ['review', 'review-dark'], ['closing', 'closing-dark'], ['steering-light', 'steering'], ['welcome', 'welcome-dark'],
      // Plugin 1.8.0: the Issues view (/sdlc-report-issue) is a command-center screen too.
      ['issues', 'issues-dark'],
    ]
    for (const [light, dark] of pairs) {
      expect(produced.has(light), `light shot "${light}" is not produced`).toBe(true)
      expect(produced.has(dark), `dark twin "${dark}" of "${light}" is not produced`).toBe(true)
    }
  })

  // Re-recorded (round 3, the integrator): this pinned v11 while the builder at 98e257a already
  // defaulted to v12 — the test was red at HEAD. The builder now defaults to the NEWEST series,
  // v13 (every v12 name has a v13 twin; the capture produced 59 shots), and the pin follows it.
  // Round 4 (the v14 verification pass): the builder moved to v14, the series the guide ships on.
  it('the guide builder defaults to the v14 shots (the command center series, round 4)', () => {
    expect(readFileSync(join(guideDir, 'build-user-guide.mjs'), 'utf8')).toContain("'observatory-v20'")
  })
})
