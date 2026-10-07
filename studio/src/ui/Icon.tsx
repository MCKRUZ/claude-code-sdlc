// #24 Icon: the single way a lucide glyph enters the kit. 16 px / stroke 1.75 matches the
// existing inline SVGs; `aria-hidden` unless a label is given, because an icon beside text is
// decoration and an icon alone is content.
import { forwardRef } from 'react'
import type { IconProps } from './contract'
import { cn } from './cn'

export const ICON_STROKE = 1.75

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { icon: Glyph, size = 16, label, className },
  ref,
) {
  return (
    <Glyph
      ref={ref}
      size={size}
      strokeWidth={ICON_STROKE}
      className={cn('shrink-0', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  )
})
