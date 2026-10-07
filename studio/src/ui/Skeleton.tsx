// #13 Skeleton: grey shapes shown BESIDE the kept loading sentence ("Reading the sprint…"), never
// instead of it — tests find the text, and a reader hears it. Every count is fixed by the caller
// so a skeleton never implies how many rows will arrive. `aria-hidden` here; the parent region
// carries `aria-busy="true"`. The shimmer (`--animate-shimmer` in type.css) is a highlight
// crossing a fixed shape — "coming" without pulsing the whole block; `[data-motion="off"]` zeroes it.
import { forwardRef } from 'react'
import type { SkeletonBlockProps, SkeletonLineProps, SkeletonRowsProps, SkeletonTileProps } from './contract'
import { cn } from './cn'

const BONE =
  'rounded-md bg-[linear-gradient(90deg,var(--color-surface-2)_0%,var(--color-surface-3)_50%,var(--color-surface-2)_100%)] ' +
  'bg-[length:200%_100%] motion-safe:animate-shimmer'

export const SkeletonLine = forwardRef<HTMLSpanElement, SkeletonLineProps>(function SkeletonLine(
  { width = '100%', className, style, ...rest },
  ref,
) {
  return <span ref={ref} aria-hidden="true" className={cn('block h-3', BONE, className)} style={{ width, ...style }} {...rest} />
})

export const SkeletonBlock = forwardRef<HTMLDivElement, SkeletonBlockProps>(function SkeletonBlock(
  { lines = 3, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} aria-hidden="true" className={cn('space-y-2', className)} {...rest}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
})

export const SkeletonRows = forwardRef<HTMLDivElement, SkeletonRowsProps>(function SkeletonRows(
  { rows = 3, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} aria-hidden="true" className={cn('space-y-1.5', className)} {...rest}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className={cn('block h-8', BONE)} />
      ))}
    </div>
  )
})

export const SkeletonTile = forwardRef<HTMLDivElement, SkeletonTileProps>(function SkeletonTile({ className, ...rest }, ref) {
  return (
    <div ref={ref} aria-hidden="true" className={cn('space-y-2 rounded-xl border border-line-1 p-4', className)} {...rest}>
      <SkeletonLine width="40%" />
      <span className={cn('block h-7 w-20', BONE)} />
      <SkeletonLine width="80%" />
    </div>
  )
})

export const Skeleton = { Line: SkeletonLine, Block: SkeletonBlock, Rows: SkeletonRows, Tile: SkeletonTile }
