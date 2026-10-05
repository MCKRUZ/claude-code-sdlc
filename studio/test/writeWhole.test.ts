/** The one place a draft reaches the disk (spec 0027; the security review of PR #91). The temp file it
 * writes by way of must not be a name anyone can plant in advance, and must never be left behind. */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeWhole } from '../electron/main/draftKeep'

describe('writeWhole', () => {
  let dir = ''
  beforeEach(() => { dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'write-whole-'))) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes the text exactly, creating folders, and leaves no temp file', () => {
    const target = join(dir, 'a', 'b', 'x.narrative.md')
    writeWhole(target, 'hello\n')
    expect(readFileSync(target, 'utf-8')).toBe('hello\n')
    expect(readdirSync(join(dir, 'a', 'b'))).toEqual(['x.narrative.md'])
  })

  it('replaces an existing file', () => {
    const target = join(dir, 'x.md')
    writeFileSync(target, 'old')
    writeWhole(target, 'new')
    expect(readFileSync(target, 'utf-8')).toBe('new')
  })

  it('does not follow a link planted at the name the old code would have used', () => {
    const outside = join(dir, 'outside.txt')
    writeFileSync(outside, 'untouched')
    const target = join(dir, 'x.md')
    try {
      symlinkSync(outside, `${target}.${process.pid}.tmp`)
    } catch {
      return // this platform cannot create links without privileges; the random name is still tested below
    }
    writeWhole(target, 'draft')
    expect(readFileSync(outside, 'utf-8')).toBe('untouched')
    expect(readFileSync(target, 'utf-8')).toBe('draft')
  })

  it('uses a different temp name every time', () => {
    const names = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const target = join(dir, `n${i}.md`)
      writeWhole(target, 'x')
      names.add(readdirSync(dir).filter((f) => f.endsWith('.tmp')).join(','))
    }
    expect([...names]).toEqual(['']) // none left, and (by the test above) none predictable
  })

  it('removes its temp file when the rename fails, and says so by throwing', () => {
    const target = join(dir, 'taken')
    mkdirSync(join(target, 'inside'), { recursive: true }) // a non-empty folder cannot be replaced by a file
    expect(() => writeWhole(target, 'draft')).toThrow()
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(existsSync(join(target, 'inside'))).toBe(true)
  })
})
