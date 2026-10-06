/** The Azure DevOps extension's credential variables are redacted by NAME (code-host providers
 * §7, commandRunner row): an ADO PAT has no prefix like `ghp_` to recognise, so the variable
 * that carries it is what the console must never show. Additive to redact.test.ts — every case
 * there still holds; these are the az-specific ones, in their own file so the original is
 * untouched. */

import { describe, expect, it } from 'vitest'
import { redact } from '../electron/main/commandRunner'

const PAT = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'

describe('redact — Azure DevOps credential variables', () => {
  it('masks AZURE_DEVOPS_EXT_PAT=<value>', () => {
    expect(redact(`AZURE_DEVOPS_EXT_PAT=${PAT}`)).toBe('AZURE_DEVOPS_EXT_PAT=***')
    expect(redact(`env AZURE_DEVOPS_EXT_PAT=${PAT} az repos list`)).toBe('env AZURE_DEVOPS_EXT_PAT=*** az repos list')
  })

  it('masks AZURE_DEVOPS_EXT_AUTH_TOKEN=<value>, which the token= catch-all cannot see inside a word', () => {
    // `_` is a word character, so `\btoken` never matched inside `AUTH_TOKEN=` — the reason
    // this rule exists at all.
    expect(redact(`AZURE_DEVOPS_EXT_AUTH_TOKEN=${PAT}`)).toBe('AZURE_DEVOPS_EXT_AUTH_TOKEN=***')
  })

  it('masks the colon and quoted shapes a shell or a log would print', () => {
    expect(redact(`AZURE_DEVOPS_EXT_PAT: "${PAT}"`)).toBe('AZURE_DEVOPS_EXT_PAT=***')
    expect(redact(`AZURE_DEVOPS_EXT_PAT='${PAT}'`)).toBe('AZURE_DEVOPS_EXT_PAT=***')
    expect(redact(`AZURE_DEVOPS_EXT_PAT = ${PAT}`)).toBe('AZURE_DEVOPS_EXT_PAT=***')
  })

  it('leaves the variable NAME alone when nothing is assigned — prose about it is not a credential', () => {
    const text = 'Set AZURE_DEVOPS_EXT_PAT in your environment to sign in with a PAT'
    expect(redact(text)).toBe(text)
  })

  it('the Basic/Bearer backstop still covers a PAT that arrives as an Authorization header', () => {
    expect(redact('Authorization: Basic OmExYjJjM2Q0ZTVmNmc3aDhpOWowazFsMm0zbjRvNXA2cTdyOHM5dDA='))
      .toBe('Authorization: Basic ***')
  })

  it('every pre-existing rule is unchanged', () => {
    expect(redact('https://user:ghp_abcdefghijklmnopqrstuvwxyz123456@dev.azure.com/contoso/_git/x')).toBe('https://***@dev.azure.com/contoso/_git/x')
    expect(redact('token=github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789')).toBe('token=***')
    expect(redact('password=hunter2')).toBe('password=***')
    for (const text of ['Merged pull request #42: Update requirements.md', 'https://dev.azure.com/contoso/Claims/_git/claims-api']) {
      expect(redact(text)).toBe(text)
    }
  })
})
