import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openReport } from '../electron/main/activityRuns'

// "Open report" hands a path to the operating system's default program. The path crosses from the
// renderer, so the only thing it may ever open is a generated page inside <project>/.sdlc/reports/.

function canMakeSymlinks(dir: string): boolean {
  try {
    symlinkSync(dir, join(dir, '.probe'), 'junction')
    rmSync(join(dir, '.probe'), { force: true, recursive: false })
    return true
  } catch {
    return false
  }
}

describe('openReport', () => {
  let root: string
  let project: string
  let reports: string
  let open: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'open-report-')))
    project = join(root, 'project')
    reports = join(project, '.sdlc', 'reports')
    mkdirSync(reports, { recursive: true })
    writeFileSync(join(reports, '00-discovery-report.html'), '<html></html>')
    writeFileSync(join(reports, 'notes.txt'), 'not a page')
    writeFileSync(join(project, 'README.html'), '<html>outside</html>')
    writeFileSync(join(root, 'secret.html'), '<html>secret</html>')
    open = vi.fn(async () => '')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('opens a report inside .sdlc/reports, given as an absolute path', async () => {
    const path = join(reports, '00-discovery-report.html')
    expect(await openReport(project, path, open)).toEqual({ ok: true })
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(path)
  })

  it('opens a report given relative to the project', async () => {
    expect(await openReport(project, '.sdlc/reports/00-discovery-report.html', open)).toEqual({ ok: true })
    expect(open).toHaveBeenCalledWith(join(reports, '00-discovery-report.html'))
  })

  it('opens the index page --all writes', async () => {
    writeFileSync(join(reports, 'index.html'), '<html>index</html>')
    expect((await openReport(project, join(reports, 'index.html'), open)).ok).toBe(true)
  })

  it.each([
    ['a file in the project but outside the reports folder', () => join(project, 'README.html')],
    ['a file outside the project', () => join(root, 'secret.html')],
    ['a ".." segment that stays inside the reports folder', () => '.sdlc/reports/../reports/00-discovery-report.html'],
    ['a ".." segment that climbs out', () => '.sdlc/reports/../../README.html'],
    ['a ".." segment in an absolute path', () => join(reports, '..', '..', '..', 'secret.html')],
    ['a backslash ".." segment', () => '.sdlc\\reports\\..\\..\\README.html'],
    ['a folder named like a report', () => '.sdlc/reports'],
  ])('refuses %s with one error line and opens nothing', async (_name, path) => {
    const r = await openReport(project, path(), open)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/^[^\n]+$/)
    expect(open).not.toHaveBeenCalled()
  })

  it('refuses a file that is not a web page', async () => {
    const r = await openReport(project, join(reports, 'notes.txt'), open)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/\.html/) })
    expect(open).not.toHaveBeenCalled()
  })

  it('refuses a report that is not there', async () => {
    const r = await openReport(project, join(reports, 'gone.html'), open)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/^[^\n]+$/)
    expect(open).not.toHaveBeenCalled()
  })

  it('refuses when the project has no reports folder at all', async () => {
    const bare = join(root, 'bare')
    mkdirSync(bare)
    expect((await openReport(bare, join(bare, '.sdlc', 'reports', 'x.html'), open)).ok).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('refuses a link inside the reports folder that leads outside it', async (ctx) => {
    if (!canMakeSymlinks(root)) ctx.skip()
    const link = join(reports, 'escape.html')
    symlinkSync(join(root, 'secret.html'), link, 'file')
    const r = await openReport(project, link, open)
    expect(r.ok).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('refuses a reports folder that is itself a link to somewhere else', async (ctx) => {
    if (!canMakeSymlinks(root)) ctx.skip()
    const elsewhere = join(root, 'elsewhere')
    mkdirSync(elsewhere)
    writeFileSync(join(elsewhere, 'a.html'), '<html></html>')
    const other = join(root, 'other-project')
    mkdirSync(join(other, '.sdlc'), { recursive: true })
    symlinkSync(elsewhere, join(other, '.sdlc', 'reports'), 'junction')
    const r = await openReport(other, join(other, '.sdlc', 'reports', 'a.html'), open)
    expect(r.ok).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('reports the operating system\'s own failure as one line', async () => {
    open.mockResolvedValue('Failed to open path\nwith detail')
    const r = await openReport(project, join(reports, '00-discovery-report.html'), open)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/^[^\n]+$/)
  })

  it('treats an opener that throws as a failure, not a crash', async () => {
    open.mockRejectedValue(new Error('no default browser'))
    expect((await openReport(project, join(reports, '00-discovery-report.html'), open)).ok).toBe(false)
  })
})
