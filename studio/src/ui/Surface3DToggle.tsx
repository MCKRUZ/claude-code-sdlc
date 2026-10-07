// #28 Surface3DToggle: exactly two buttons, "Graph" / "Table", each `aria-pressed`. Rendered by
// the scene host (SceneShell), never inside `[data-testid=sprint-board]`, so the board's own
// button count stays what the sprint spec pins. It is a Segmented with a fixed option list.
import { Orbit, Table2 } from 'lucide-react'
import type { SceneSurfaceValue, SegmentedOption, Surface3DToggleProps } from './contract'
import { Segmented } from './Segmented'

export const SURFACE_OPTIONS: readonly SegmentedOption<SceneSurfaceValue>[] = [
  { value: 'graph', label: 'Graph', icon: Orbit },
  { value: 'table', label: 'Table', icon: Table2 },
]

export function Surface3DToggle({ value, onChange, disabled, disabledReason, className }: Surface3DToggleProps) {
  return (
    <Segmented<SceneSurfaceValue>
      label="Surface"
      options={[...SURFACE_OPTIONS]}
      value={value}
      onChange={onChange}
      tone="neutral"
      size="sm"
      disabled={disabled}
      disabledReason={disabledReason}
      className={className}
      data-testid="surface-toggle"
    />
  )
}
