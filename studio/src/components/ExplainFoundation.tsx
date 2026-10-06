import { useCallback, useEffect, useRef, useState } from 'react'
import type { FoundationSummary } from '../../shared/types'
import { Card, Eyebrow, Notice, PageHeader, SkeletonRows } from '../ui'
import { useListReveal } from './screenMotion'

/** What Foundation handed to Build (spec 0013).
 *
 * Every item is read from the documents themselves — the spec asks for that explicitly, and
 * the reason is worth keeping in mind while reading this: a list written into the application
 * would look right the day somebody wrote it and stop matching the moment a template changed,
 * leaving a confident summary of something no longer true.
 *
 * A document Foundation did not produce is SHOWN, saying so. A Build that opened without a
 * risk-tier map is a real situation, and a quietly shorter list hides exactly that.
 */
export function FoundationView({ projectPath }: { projectPath: string }) {
  const [summary, setSummary] = useState<FoundationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  useListReveal(root, summary?.ok ? projectPath : null)

  const load = useCallback(async () => {
    setLoading(true)
    setSummary(await window.studio.getFoundationSummary(projectPath))
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  if (loading && !summary) {
    return (
      <div aria-busy="true">
        <p role="status" className="text-sm text-ink-3">Reading what Foundation delivered…</p>
        <SkeletonRows rows={3} className="mt-3" />
      </div>
    )
  }
  if (!summary) return null

  if (!summary.ok) {
    return (
      // Never an empty list — that would read as "Foundation delivered nothing", a claim about
      // the project rather than about this failing to read.
      <Notice tone="warn" title="What Foundation delivered could not be read.">{summary.error}</Notice>
    )
  }

  const delivered = summary.documents.filter((d) => d.exists)
  const absent = summary.documents.filter((d) => !d.exists)

  return (
    <div ref={root} className="space-y-4">
      {/* S1: the kit header; the heading text is byte-identical (board.spec finds it by name). */}
      <div>
        <PageHeader
          eyebrow="Build · How it is going"
          title="What Build inherited"
          lede={summary.stage?.description || 'Read from the documents themselves, so this cannot describe a Foundation that no longer matches them.'}
        />
        {summary.stage?.description && (
          <p className="mt-1 text-xs text-ink-3">
            Read from the documents themselves, so this cannot describe a Foundation that no
            longer matches them.
          </p>
        )}
      </div>

      {delivered.length > 0 && (
        <Card>
          <Eyebrow as="h3" className="mb-2">Delivered</Eyebrow>
          <ul className="divide-y divide-line-1">
            {delivered.map((doc) => (
              <li key={doc.path} className="py-2" data-reveal="">
                <p className="text-sm font-medium text-ink-1">{doc.name}</p>
                {/* Where it lives, because a person reading this will want to open it. */}
                <p className="font-mono text-xs text-ink-3">{doc.path}</p>
                {doc.sections.length > 0 ? (
                  <p className="mt-1 text-xs text-ink-2">{doc.sections.join(' · ')}</p>
                ) : (
                  <p className="mt-1 text-xs text-ink-3">
                    No sections yet — the document exists but has not been filled in.
                  </p>
                )}
                {doc.note && <p className="mt-0.5 text-xs text-status-warn-ink">{doc.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {absent.length > 0 && (
        <Notice tone="warn">
          {/* A real heading, not the Notice's <p> title: board.spec locates this block by
              `heading "Not delivered"`, and a document Foundation did not produce is a section
              of this screen, not a caption. */}
          <h3 className="font-semibold">Not delivered</h3>
          <ul className="mt-1 space-y-2">
            {absent.map((doc) => (
              <li key={doc.path} className="text-sm" data-reveal="">
                <span className="font-medium">{doc.name}</span>
                <span className="mt-0.5 block font-mono text-xs">{doc.path}</span>
                {doc.note && <span className="block text-xs">{doc.note}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Build can run without these. What they would have told you is simply not written
            down anywhere, which is worth knowing before anyone needs it.
          </p>
        </Notice>
      )}
    </div>
  )
}
