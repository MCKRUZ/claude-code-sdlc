// #29 ThemeToggle / DensityToggle / MotionToggle: each a Segmented of `aria-pressed` buttons —
// never an `<input>` (the spec view pins page-wide `input` = 0). They read and write through
// `preferenceBridge`, so the only props are layout and the optional explanatory note (Settings ›
// Appearance says that motion `on` overrides the OS's reduced-motion setting).
import type { ReactNode } from 'react'
import { Monitor, Moon, Rows3, Rows4, Sparkles, Sun } from 'lucide-react'
import type { DensityToggleProps, MotionToggleProps, SegmentedOption, ThemeToggleProps } from './contract'
import type { DensityAttr, ThemePreference } from '../theme/tokens'
import type { MotionPreference } from '../motion/contract'
import { cn } from './cn'
import { Segmented } from './Segmented'
import { readDensity, readMotion, readTheme, usePreference, writeDensity, writeMotion, writeTheme } from './preferenceBridge'

const THEME: SegmentedOption<ThemePreference>[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

const DENSITY: SegmentedOption<DensityAttr>[] = [
  { value: 'comfortable', label: 'Comfortable', icon: Rows3 },
  { value: 'compact', label: 'Compact', icon: Rows4 },
]

const MOTION: SegmentedOption<MotionPreference>[] = [
  { value: 'auto', label: 'Auto', icon: Sparkles },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-ink-3">{children}</p>
}

export function ThemeToggle({ size = 'sm', className, note }: ThemeToggleProps) {
  const value = usePreference(readTheme)
  return (
    <div className={cn('inline-flex flex-col', className)}>
      <Segmented<ThemePreference> label="Theme" options={THEME} value={value} onChange={writeTheme} tone="neutral" size={size} data-testid="theme-toggle" />
      {note ? <Note>{note}</Note> : null}
    </div>
  )
}

export function DensityToggle({ size = 'sm', className, note }: DensityToggleProps) {
  const value = usePreference(readDensity)
  return (
    <div className={cn('inline-flex flex-col', className)}>
      <Segmented<DensityAttr> label="Density" options={DENSITY} value={value} onChange={writeDensity} tone="neutral" size={size} data-testid="density-toggle" />
      {note ? <Note>{note}</Note> : null}
    </div>
  )
}

export function MotionToggle({ size = 'sm', className, note }: MotionToggleProps) {
  const value = usePreference(readMotion)
  return (
    <div className={cn('inline-flex flex-col', className)}>
      <Segmented<MotionPreference> label="Motion" options={MOTION} value={value} onChange={writeMotion} tone="neutral" size={size} data-testid="motion-toggle" />
      {note ? <Note>{note}</Note> : null}
    </div>
  )
}
