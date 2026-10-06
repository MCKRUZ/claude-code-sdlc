import { useEffect, useRef, useState } from 'react'
import type { SetupPlan } from '../../shared/types'
import { Button, Card, EYEBROW_CLASS, Field, Notice, Select } from '../ui'
import { useEnter } from '../motion/useEnter'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { listStagger } from '../motion/choreo'
import { EntryShell, choreoContext } from './entryScreenBits'

function humanize(profileId: string): string {
  return profileId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** The setup wizard an existing folder (or a just-created one) goes through: pick a playbook,
 * see exactly what will be written, confirm. The plan is the plugin's preview, shown as-is. */
export function SetupFlow({
  projectPath,
  onCancel,
  onConfirm,
}: {
  projectPath: string
  onCancel: () => void
  onConfirm: (profileId: string) => Promise<void>
}) {
  const [profiles, setProfiles] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [plan, setPlan] = useState<SetupPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const wellRef = useRef<HTMLDivElement | null>(null)
  useEnter(cardRef, 'rise')

  useEffect(() => {
    window.studio.listProfiles().then((list) => {
      setProfiles(list)
      if (list.length > 0) setSelected(list[0])
    })
  }, [])

  // Latest wins. Each preview is a subprocess, and two can be in flight when the profile changes
  // before the first answers; without the guard the slower one landed last and the plan on
  // screen belonged to a profile no longer selected — a confirm would then write the wrong
  // profile. The effect's cleanup marks the previous request stale, so only the newest result is
  // ever shown.
  useEffect(() => {
    if (!selected) return
    let stale = false
    setPlan(null)
    setError(null)
    window.studio.previewSetup(projectPath, selected).then((result) => {
      if (stale) return
      if (result.error) setError(result.error)
      else if (result.plan) setPlan(result.plan)
    })
    return () => { stale = true }
  }, [projectPath, selected])

  // The "This will create" lines arrive together when the preview lands; they stagger in once
  // per plan (§4 #4), never on a re-render.
  useStudioGSAP(
    () => {
      const well = wellRef.current
      if (!well) return
      listStagger.play(choreoContext(well), { items: Array.from(well.querySelectorAll('[data-reveal]')) })
    },
    { scope: wellRef, dependencies: [plan] },
  )

  const canConfirm = Boolean(selected && plan && !plan.already_exists)

  return (
    <EntryShell>
      <Card ref={cardRef} className="mx-auto w-full max-w-lg space-y-4 rounded-4 p-6 shadow-2">
        <div>
          <h1 className="text-lg text-ink-1">Set up a project here</h1>
          <p className="mt-1 break-all font-mono text-xs text-ink-3">{projectPath}</p>
        </div>

        <Field label="Playbook">
          <Select
            value={selected ?? ''}
            onChange={(v) => setSelected(v)}
            options={profiles.map((p) => ({ value: p, label: humanize(p) }))}
          />
        </Field>

        {error && <Notice tone="error">{error}</Notice>}

        {plan?.already_exists && (
          <Notice tone="info">This folder already has a project — nothing would be created.</Notice>
        )}

        {plan && !plan.already_exists && (
          <div>
            <h2 className={`${EYEBROW_CLASS} mb-1`}>This will create</h2>
            <div ref={wellRef} className="max-h-48 overflow-auto rounded-[10px] border border-line-1 bg-surface-2 p-3 font-mono text-code text-ink-3">
              {plan.directories.map((d) => (
                <div key={d} data-reveal="">{d}/</div>
              ))}
              {plan.files.map((f) => (
                <div key={f} data-reveal="" className="text-ink-1">{f}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} className="text-sm">
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canConfirm}
            loading={running}
            loadingLabel="Setting up…"
            className="px-4 text-sm"
            onClick={async () => {
              if (!selected) return
              setRunning(true)
              try {
                await onConfirm(selected)
              } finally {
                setRunning(false)
              }
            }}
          >
            Set up project
          </Button>
        </div>
      </Card>
    </EntryShell>
  )
}
