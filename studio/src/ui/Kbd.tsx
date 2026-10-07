// #22 Kbd: `<kbd>` for palette rows and the shortcuts help. `'Mod'` renders ⌘ on macOS and
// Ctrl elsewhere, decided at render time (not module load) so the file is SSR-safe. The glyph
// map keeps the help readable without a legend.
import { forwardRef } from 'react'
import type { KbdProps } from './contract'
import { cn } from './cn'

const GLYPH: Record<string, string> = {
  Shift: '⇧',
  Alt: '⌥',
  Enter: '↵',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: '⌫',
}

/** The keycap ON A TOOLTIP PLATE. The plate is the theme's inverse (`bg-slate-900 text-white`
 * in light; dark.css flips that pair to a pale plate with dark ink), so the keycap reads its
 * ink, edge and fill from `ink-inverse` — the one token that is light on the dark plate and dark
 * on the pale one — never from `white`, which dark.css deliberately does not remap (v14: the
 * Settings tooltip's ⌘, drew white on a pale plate — a blank box). */
export const KBD_ON_PLATE_CLASS = 'border-ink-inverse/20 bg-ink-inverse/10 text-ink-inverse shadow-none'

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
  return /mac|iphone|ipad/i.test(platform)
}

export function keyLabel(key: string, mac: boolean): string {
  if (key === 'Mod') return mac ? '⌘' : 'Ctrl'
  if (key === 'Alt' && !mac) return 'Alt'
  return GLYPH[key] ?? key
}

export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd({ keys, className, ...rest }, ref) {
  const mac = isMacPlatform()
  return (
    <kbd
      ref={ref}
      className={cn(
        // A keycap: fixed 20 px, a 1 px bottom shadow for the "key" edge — it draws what it depicts.
        'inline-flex h-5 min-w-[20px] items-center justify-center gap-0.5 rounded-[5px] border border-line-1 bg-surface-1 px-1.5 font-sans text-[11px] font-medium text-ink-3 shadow-[0_1px_0_var(--color-line-2)]',
        className,
      )}
      {...rest}
    >
      {keys.map((key, i) => (
        <span key={`${key}-${i}`}>{keyLabel(key, mac)}</span>
      ))}
    </kbd>
  )
})
