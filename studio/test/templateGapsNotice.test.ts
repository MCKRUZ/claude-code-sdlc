/** A document that lacks a section its template requires is now shown as sections instead of raw
 * text, so the gap has to be said out loud — otherwise a partly matching document would look like
 * a complete one. The notice names what is missing in plain words and says nothing is hidden.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { missingSectionNames, TemplateGapsNotice } from '../src/components/TemplateGapsNotice'

const render = (warnings: string[]) => renderToStaticMarkup(createElement(TemplateGapsNotice, { warnings }))

describe('missingSectionNames', () => {
  it('reads the section names out of the plugin’s warnings', () => {
    expect(missingSectionNames(["section 'Data Model' not found", "section 'Sequence Diagrams — P0 Flows' not found"]))
      .toEqual(['Data Model', 'Sequence Diagrams — P0 Flows'])
  })

  it('keeps a warning it does not recognize, verbatim, rather than dropping it', () => {
    expect(missingSectionNames(['something unexpected'])).toEqual(['something unexpected'])
  })
})

describe('TemplateGapsNotice', () => {
  it('shows nothing for a document that has every section its template requires', () => {
    expect(render([])).toBe('')
  })

  it('names each missing section', () => {
    const html = render(["section 'Data Model' not found", "section 'Error Catalog' not found"])
    expect(html).toContain('Data Model')
    expect(html).toContain('Error Catalog')
  })

  it('says the rest of the document is intact and editable, so a partial document is not read as broken', () => {
    const html = render(["section 'Data Model' not found"])
    expect(html).toMatch(/everything else|nothing is hidden|rest of the document/i)
  })

  it('counts them in words, singular and plural', () => {
    expect(render(["section 'A' not found"])).toContain('1 section')
    expect(render(["section 'A' not found", "section 'B' not found"])).toContain('2 sections')
  })

  it('is marked so a test or a reader can find it', () => {
    expect(render(["section 'A' not found"])).toContain('data-testid="template-gaps"')
  })
})
