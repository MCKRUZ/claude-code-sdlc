import { describe, it, expect } from 'vitest'
import { redact } from '../electron/main/commandRunner'

// Spec 0009's first acceptance check: Studio "never prompts for, stores or displays a
// password or token." This is the one function that guarantees it for anything that ends
// up in the console, regardless of which git/gh command produced it.
describe('redact', () => {
  it('masks a credentialed HTTPS URL', () => {
    const out = redact('https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz123456@github.com/foo/bar.git')
    expect(out).toBe('https://***@github.com/foo/bar.git')
    expect(out).not.toContain('ghp_')
  })

  it('masks a bare GitHub personal access token in text', () => {
    const out = redact('remote: Invalid credentials for ghp_abcdefghijklmnopqrstuvwxyz123456')
    expect(out).toBe('remote: Invalid credentials for ***')
  })

  it('masks a fine-grained github_pat_ token', () => {
    const out = redact('token=github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(out).toBe('token=***')
  })

  it('masks every gh token prefix variant', () => {
    for (const prefix of ['ghp', 'gho', 'ghu', 'ghs', 'ghr']) {
      const token = `${prefix}_${'a'.repeat(36)}`
      expect(redact(`before ${token} after`)).toBe('before *** after')
    }
  })

  it('leaves ordinary text completely untouched', () => {
    const text = 'Merged pull request #42: Update requirements.md'
    expect(redact(text)).toBe(text)
  })

  it('leaves a plain https URL with no credentials untouched', () => {
    const text = 'https://github.com/MCKRUZ/claude-code-sdlc.git'
    expect(redact(text)).toBe(text)
  })

  it('masks multiple occurrences in the same string', () => {
    const token = `ghp_${'a'.repeat(36)}`
    const out = redact(`first ${token} second ${token}`)
    expect(out).toBe('first *** second ***')
  })

  it('does not false-positive on a short token-like word', () => {
    // Too short to be a real token (< 20 chars after the prefix) — must NOT be redacted,
    // or a real short identifier that happens to start with "ghp_" would be silently eaten.
    const text = 'ghp_short'
    expect(redact(text)).toBe(text)
  })
})
