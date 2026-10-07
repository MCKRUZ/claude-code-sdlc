import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** GLSL reserved words that read like ordinary names. `float out = …` compiled nowhere: the
 * ground shader failed in production and the grid never drew (found by a probe, not a test —
 * hence this one). Scans every shader string under src/scenes for a declaration using one. */
const RESERVED = ['out', 'in', 'inout', 'input', 'output', 'filter', 'sizeof', 'cast', 'namespace', 'using', 'this', 'class', 'union', 'enum', 'typedef', 'template', 'goto', 'switch', 'default', 'inline', 'noinline', 'volatile', 'public', 'static', 'extern', 'external', 'interface', 'long', 'short', 'double', 'half', 'fixed', 'unsigned', 'superp', 'asm']
const DECL = new RegExp(`\\b(?:float|int|bool|vec[234]|ivec[234]|bvec[234]|mat[234])\\s+(${RESERVED.join('|')})\\b`, 'g')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('scene shaders', () => {
  it('declare no variable with a GLSL reserved word', () => {
    const offenders: string[] = []
    for (const file of walk(join(__dirname, '..', '..', 'src', 'scenes'))) {
      const text = readFileSync(file, 'utf-8')
      if (!/gl_FragColor|gl_Position|fragmentShader|vertexShader/.test(text)) continue
      for (const m of text.matchAll(DECL)) offenders.push(`${file.split('/src/')[1]}: "${m[0]}"`)
    }
    expect(offenders).toEqual([])
  })
})
