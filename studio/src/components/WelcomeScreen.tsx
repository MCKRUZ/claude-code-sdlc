import { useRef } from 'react'
import { FolderOpen, Plus } from 'lucide-react'
import type { RecentProject } from '../../shared/types'
import { Button, Card, EYEBROW_CLASS, EmptyState, HoverCard, Kbd } from '../ui'
import { useSplitTitle } from '../motion/splitTitle'
import { useStudioGSAP, engineFor } from '../motion/useStudioGSAP'
import { welcomeOpen } from '../motion/choreo'
import { CornerThemeToggle, EntryShell, choreoContext } from './entryScreenBits'
import { TogoMark } from './brand/TogoMark'
import { PRODUCT_KANJI, PRODUCT_NAME } from './brand/TogoWordmark'

/** A list in one card reads as one instrument panel; more rows than this read as a feed. */
const RECENT_ROWS = 6

function formatOpened(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** The tail of a path — the folder and its parent — so the row says WHICH project rather than
 * which temp directory it lives under; the full path is in the hover card. */
export function shortPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  if (parts.length <= 2) return path
  return `…/${parts.slice(-2).join('/')}`
}

/** The first screen. Two columns from `sm` up — the lockup with the two ways in on the left,
 * the recent projects on the right — so a returning person sees their project before they read
 * the pitch. The Ambient Field sits behind both; the theme toggle is window chrome, pinned to
 * the top-right corner of the screen. The product's name and mark appear together here once,
 * at the one moment there is nothing else to look at — so `EntryShell` draws no second lockup. */
export function WelcomeScreen({
  recentProjects,
  onPickFolder,
  onNewProject,
  onOpenRecent,
}: {
  recentProjects: RecentProject[]
  onPickFolder: () => void
  onNewProject: () => void
  onOpenRecent: (path: string) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  // Catalogue row #1 in two parts. Everything but the title plays at mount; the title's chars
  // play when SplitText has them (it waits for the web font). The h1 is hidden only once a split
  // is under way — with motion off `useSplitTitle` never calls back, and the heading is never
  // touched — and a late timeline step restores it in case the split never lands.
  useStudioGSAP(
    (g) => {
      const scope = rootRef.current
      if (!scope) return
      const ctx = choreoContext(scope)
      welcomeOpen.play(ctx, {
        canvas: canvasRef.current,
        subtitle: scope.querySelector('[data-welcome-subtitle]'),
        buttons: Array.from(scope.querySelectorAll('[data-welcome-action]')),
        recentRows: Array.from(scope.querySelectorAll('[data-welcome-row]')),
      })
      if (ctx.enabled && titleRef.current) {
        g.set(titleRef.current, { opacity: 0 })
        g.to(titleRef.current, { opacity: 1, duration: 0, delay: 1.2 })
      }
    },
    // Row #1's trigger is "screen.kind becomes welcome": play once at mount, never again on the
    // re-renders a click causes (`setOpening` → App → here), which used to hide the h1 for 1.2 s
    // and fade the buttons from 0 a second and third time.
    { scope: rootRef, dependencies: [] },
  )
  // The split targets the <h1> only — never the mark beside it.
  useSplitTitle(titleRef, (chars) => {
    const scope = rootRef.current
    const title = titleRef.current
    if (!scope || !title) return
    engineFor().set(title, { opacity: 1 })
    welcomeOpen.play(choreoContext(scope), { titleChars: chars })
  })

  return (
    <EntryShell rootRef={rootRef} canvasRef={canvasRef} className="items-start pt-[22vh]" corner={<CornerThemeToggle />} brand={false}>
      <div className="mx-auto grid w-full max-w-4xl gap-12 sm:grid-cols-[1.1fr_1fr] sm:items-start">
        <div className="space-y-8">
          <div>
            {/* Gap 20 px = the lockup's 33 units at 40 px: the T's left edge sits ≈ 20 px right
                of the disc. `text-2xl` is the brand's Welcome h1 (28/34, 650, −0.02em) — no
                extra weight or tracking classes, so the kit's type scale owns it. */}
            <div className="flex items-start gap-5">
              <TogoMark className="mt-[1px] h-10 w-10 shrink-0 text-accent-600" />
              <h1 ref={titleRef} className="text-2xl text-ink-1">{PRODUCT_NAME}</h1>
            </div>
            {/* `lang="ja"` lets the OS pick a CJK face and switches the screen reader's voice;
                no font is bundled (CSP: nothing remote). 統合 is an explanation, not a logotype. */}
            <p className="mt-3 text-sm text-ink-3">
              <span lang="ja">{PRODUCT_KANJI}</span> — integration. The delivery instrument.
            </p>
            <p data-welcome-subtitle="" className="mt-6 text-sm text-ink-2">Start a new project, or open one you already have.</p>
          </div>
          <div className="flex max-w-sm flex-col gap-2">
            <Button data-welcome-action="" variant="primary" block icon={Plus} onClick={onNewProject} className="rounded-xl px-4 py-3 text-sm">
              New project…
            </Button>
            <Button data-welcome-action="" variant="secondary" block icon={FolderOpen} onClick={onPickFolder} className="rounded-xl px-4 py-3 text-sm">
              Open folder…
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-ink-4">
            <Kbd keys={['Mod', 'K']} /> searches and jumps once a project is open.
          </p>
        </div>
        <RecentList projects={recentProjects} onOpen={onOpenRecent} />
      </div>
    </EntryShell>
  )
}

/** One card, one divided list (G1-3): eight bordered cards read as a feed. The first and last
 * row buttons take the card's radius so a hover tint never squares off a rounded corner; the
 * HoverCard wraps the trigger in its own span, hence the descendant selector. */
function RecentList({ projects, onOpen }: { projects: RecentProject[]; onOpen: (path: string) => void }) {
  return (
    <div className="sm:pt-7">
      {/* `Eyebrow`'s `as` union has no h2 (the kit contract is not this group's to widen), so the
          heading takes the kit's class string — the same voice, one element. */}
      <h2 className={`${EYEBROW_CLASS} mb-2`}>Recent</h2>
      {projects.length === 0 ? (
        <EmptyState title="No recent projects" body="Projects you create or open will be listed here." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line-1">
            {projects.slice(0, RECENT_ROWS).map((p) => (
              <li key={p.path} data-welcome-row="" className="first:[&_button]:rounded-t-xl last:[&_button]:rounded-b-xl">
                <HoverCard
                  className="w-full"
                  content={
                    <span className="flex flex-col gap-0.5">
                      <span className="font-mono text-2xs text-ink-2 [overflow-wrap:anywhere]">{p.path}</span>
                      <span className="text-ink-3">Last opened {formatOpened(p.lastOpenedAt)}</span>
                    </span>
                  }
                  trigger={
                    <button
                      type="button"
                      onClick={() => onOpen(p.path)}
                      className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-[120ms] hover:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-1">{p.name}</span>
                        {/* Truncates from the LEFT: `dir="rtl"` puts the ellipsis at the inline-end,
                            which is the left edge, and `<bdi>` isolates the path so its slashes
                            keep their LTR order. The folder name — what says WHICH project — stays. */}
                        <span dir="rtl" className="block max-w-full truncate text-left font-mono text-2xs text-ink-4" title={p.path}>
                          <bdi>{shortPath(p.path)}</bdi>
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-4">{formatOpened(p.lastOpenedAt).split(',')[0]}</span>
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
