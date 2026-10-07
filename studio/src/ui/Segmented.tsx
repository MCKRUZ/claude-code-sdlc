// #8 Segmented: a row of `aria-pressed` buttons (BuildBoard roles, the 14/30/90 window, risk
// tier, and the Graph/Table, theme, density and motion toggles). Two class strings are literal
// pins: `tone=accent` emits `bg-brand-600 text-white` on the active option and `tone=inverse`
// emits `bg-slate-900 text-white` (board.spec / ExplainViews). The thumb `<span
// data-segmented-thumb>` is a real sliding fill: a layout effect measures the active button and
// translates the thumb under it with a CSS transition (zero JS per frame, zeroed by
// `[data-motion="off"]`). Once measured, `data-segmented-measured` lets base.css make the
// pressed button transparent so the thumb is what you see — the button keeps its pinned
// classes, and jsdom/static markup (which never measures) paints the button itself. The kit
// never imports gsap; `motion/choreo/segmentedThumb` exists for a host timeline.
import { forwardRef, useLayoutEffect, useRef, type ForwardedRef, type KeyboardEvent } from 'react'
import type { ControlSize, SegmentedProps, SegmentedTone } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'
import { isRovingKey, nextRovingIndex } from './roving'
import { DisabledReason, disabledReasonProps } from './VisuallyHidden'

export const SEGMENTED_ACTIVE: Record<SegmentedTone, string> = {
  accent: 'bg-brand-600 text-white',
  inverse: 'bg-slate-900 text-white',
  neutral: 'bg-surface-1 text-ink-1 shadow-1',
}

const INACTIVE = 'text-ink-2 hover:text-ink-1'

const SIZE: Record<ControlSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
}

const THUMB =
  'pointer-events-none absolute top-[2px] bottom-[2px] left-0 rounded-md ' +
  'transition-[transform,width] duration-[180ms] ease-[var(--ease-in-out)] will-change-transform'

/** Positions the thumb under the active button. Returns whether a real width was measured —
 * jsdom reports 0, and a 0-wide thumb must stay hidden so the button paints its own fill. */
function placeThumb(thumb: HTMLSpanElement | null, button: HTMLButtonElement | null | undefined): boolean {
  if (!thumb || !button) return false
  const width = button.offsetWidth
  if (width <= 0) return false
  thumb.style.transform = `translateX(${button.offsetLeft}px)`
  thumb.style.width = `${width}px`
  return true
}

function SegmentedInner<V extends string>(
  { options, value, onChange, tone = 'accent', size = 'md', label, disabled, disabledReason, className, ...rest }: SegmentedProps<V>,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const container = useRef<HTMLDivElement | null>(null)
  const thumb = useRef<HTMLSpanElement | null>(null)
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const enabled = options.map((o) => !o.disabled && !disabled)

  // Measure after layout so the first paint already has the thumb in place; re-measure when the
  // container resizes (a label wraps, density changes) so the thumb never drifts off its button.
  useLayoutEffect(() => {
    const measure = () => {
      const measured = placeThumb(thumb.current, buttons.current[activeIndex])
      const el = container.current
      if (!el) return
      if (measured) el.setAttribute('data-segmented-measured', '')
      thumb.current?.classList.toggle('hidden', !measured)
    }
    measure()
    if (typeof ResizeObserver === 'undefined' || !container.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(container.current)
    return () => ro.disconnect()
  }, [activeIndex, options.length])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!isRovingKey(e.key)) return
    const next = nextRovingIndex(e.key, index, enabled)
    if (next === null) return
    e.preventDefault()
    buttons.current[next]?.focus()
    const option = options[next]
    if (option && option.value !== value) onChange(option.value)
  }

  return (
    <div
      ref={(el) => {
        container.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      role="group"
      aria-label={label}
      data-segmented-tone={tone}
      className={cn('relative inline-flex items-center gap-0.5 rounded-[8px] bg-surface-2 p-[2px]', disabled && 'opacity-50', className)}
      {...disabledReasonProps(disabledReason, disabled)}
      {...rest}
    >
      {/* The full active string rides on the thumb (incl. `text-white`) so the dark theme's
          `.bg-slate-900.text-white` exception recolours the inverse thumb too. */}
      <span ref={thumb} aria-hidden="true" data-segmented-thumb="" className={cn(THUMB, SEGMENTED_ACTIVE[tone], 'hidden')} />
      {options.map((option, index) => {
        const active = option.value === value
        const optionDisabled = Boolean(disabled || option.disabled)
        const reason = option.disabledReason ?? disabledReason
        return (
          <button
            type="button"
            disabled={optionDisabled}
            aria-pressed={active}
            key={option.value}
            ref={(el) => {
              buttons.current[index] = el
            }}
            tabIndex={index === activeIndex ? 0 : -1}
            data-pressable=""
            onClick={() => {
              if (!active) onChange(option.value)
            }}
            onKeyDown={(e) => onKeyDown(e, index)}
            {...disabledReasonProps(reason, optionDisabled)}
            className={cn(
              'relative z-10 inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap transition-colors',
              // C5: dim ONCE. The group already carries `opacity-50` when it is disabled as a whole;
              // only an individually disabled option dims itself.
              'disabled:cursor-not-allowed',
              !disabled && 'disabled:opacity-50',
              SIZE[size],
              active ? SEGMENTED_ACTIVE[tone] : INACTIVE,
            )}
          >
            {option.icon ? <Icon icon={option.icon} size={14} /> : null}
            {option.label}
            <DisabledReason reason={reason} disabled={optionDisabled} />
          </button>
        )
      })}
    </div>
  )
}

export const Segmented = forwardRef(SegmentedInner) as <V extends string = string>(
  props: SegmentedProps<V> & { ref?: ForwardedRef<HTMLDivElement> },
) => ReturnType<typeof SegmentedInner>
