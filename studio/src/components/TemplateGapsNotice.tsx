import { Notice } from '../ui'

/** The plugin reports a missing required section as `section 'Data Model' not found`. */
export function missingSectionNames(warnings: string[]): string[] {
  return warnings.map((w) => /^section '(.*)' not found$/.exec(w)?.[1] ?? w)
}

/** Shown above a document that is missing sections its template requires but is otherwise shown
 * as sections. A document used to be thrown back to plain text for a single missing section; now
 * every section that was found is shown, so the gap has to be said out loud or a partly matching
 * document would read as a complete one. Says plainly that nothing is hidden. */
export function TemplateGapsNotice({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  const names = missingSectionNames(warnings)
  return (
    <Notice
      tone="warn"
      data-testid="template-gaps"
      className="text-sm"
      title={`This document is missing ${names.length} ${names.length === 1 ? 'section' : 'sections'} its template expects.`}
    >
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
        {names.map((n) => <li key={n}>{n}</li>)}
      </ul>
      <p className="mt-2 text-xs">
        The rest of the document is shown and editable as normal, and nothing is hidden. If that
        content is in the document under a different heading, renaming the heading to the template&apos;s
        wording will bring it in.
      </p>
    </Notice>
  )
}
