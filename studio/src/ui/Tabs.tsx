// #9 Tabs: TabList / Tab / TabPanel with WAI-ARIA wiring. The list owns `value` and `onChange`
// and hands them down through context; each Tab derives its own `id` and `aria-controls` from a
// shared `useId` base, so a panel is always labelled by its tab and a tab always controls its
// panel. StageHome's `aria-label="Stage view"` is pinned. Never used in the Sidebar
// (sidebar.test:98 forbids `role="tab"` there) — a caller's rule. The underline is a real
// `<span data-tab-underline-bar>` the list positions under the selected tab in a layout effect
// and slides with a CSS transition (zeroed under `[data-motion="off"]`); until a width has been
// measured (SSR, jsdom, first paint) base.css draws the selected tab's own bottom border
// instead, keyed off the absent `data-tab-measured`. The selected tab keeps `data-tab-underline`.
import { createContext, forwardRef, useContext, useId, useLayoutEffect, useRef, type ForwardedRef, type KeyboardEvent, type ReactNode } from 'react'
import type { TabListProps, TabPanelProps, TabProps } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'
import { isRovingKey, nextRovingIndex } from './roving'
import { DisabledReason, disabledReasonProps } from './VisuallyHidden'

interface TabsContextValue {
  value: string
  onChange: (value: string) => void
  baseId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs(component: string): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error(`${component} must be rendered inside TabList / TabPanel context (TabsProvider)`)
  return ctx
}

export const tabId = (baseId: string, value: string) => `${baseId}-tab-${value}`
export const panelId = (baseId: string, value: string) => `${baseId}-panel-${value}`

/** Wraps a TabList and its TabPanels so both share one id base. */
export function TabsProvider<V extends string>({ value, onChange, children }: { value: V; onChange: (v: V) => void; children: ReactNode }) {
  const baseId = useId()
  return <TabsContext.Provider value={{ value, onChange: onChange as (v: string) => void, baseId }}>{children}</TabsContext.Provider>
}

function TabListInner<V extends string>(
  { value, onChange, label, className, children, ...rest }: TabListProps<V>,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const parent = useContext(TabsContext)
  const baseId = useId()
  // A TabsProvider above shares its id base so panels rendered outside the list still match;
  // the list's own value/onChange are authoritative either way (they are the same facts).
  const ctx: TabsContextValue = { value, onChange: onChange as (v: string) => void, baseId: parent?.baseId ?? baseId }
  const list = useRef<HTMLDivElement | null>(null)
  const bar = useRef<HTMLSpanElement | null>(null)

  // Position the bar under the selected tab after layout; re-measure on resize so a label that
  // wraps or a density change never leaves the underline a few pixels off its tab.
  useLayoutEffect(() => {
    const measure = () => {
      const root = list.current
      const selected = root?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      const width = selected?.offsetWidth ?? 0
      if (!root || !bar.current || !selected || width <= 0) return
      bar.current.style.transform = `translateX(${selected.offsetLeft}px)`
      bar.current.style.width = `${width}px`
      root.setAttribute('data-tab-measured', '')
    }
    measure()
    if (typeof ResizeObserver === 'undefined' || !list.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(list.current)
    return () => ro.disconnect()
  }, [value])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isRovingKey(e.key)) return
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const current = tabs.findIndex((t) => t === document.activeElement)
    const next = nextRovingIndex(e.key, current < 0 ? 0 : current, tabs.map((t) => !t.disabled))
    if (next === null) return
    e.preventDefault()
    const target = tabs[next]
    target?.focus()
    const nextValue = target?.dataset.value
    if (nextValue !== undefined && nextValue !== ctx.value) ctx.onChange(nextValue)
  }
  return (
    <TabsContext.Provider value={ctx}>
      <div
        ref={(el) => {
          list.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn('relative flex items-center gap-1 border-b border-line-1', className)}
        {...rest}
      >
        {children}
        <span
          ref={bar}
          aria-hidden="true"
          data-tab-underline-bar=""
          className="pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-accent-600 transition-[transform,width] duration-[200ms] ease-[var(--ease-in-out)]"
        />
      </div>
    </TabsContext.Provider>
  )
}

export const TabList = forwardRef(TabListInner) as <V extends string = string>(
  props: TabListProps<V> & { ref?: ForwardedRef<HTMLDivElement> },
) => ReturnType<typeof TabListInner>

function TabInner<V extends string>(
  { value, icon, disabled, disabledReason, className, children, ...rest }: TabProps<V>,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const ctx = useTabs('Tab')
  const selected = ctx.value === value
  return (
    <button
      type="button"
      disabled={disabled}
      role="tab"
      id={tabId(ctx.baseId, value)}
      aria-selected={selected}
      aria-controls={panelId(ctx.baseId, value)}
      tabIndex={selected ? 0 : -1}
      data-value={value}
      data-tab-underline={selected ? '' : undefined}
      data-pressable=""
      onClick={() => {
        if (!selected) ctx.onChange(value)
      }}
      {...disabledReasonProps(disabledReason, disabled)}
      ref={ref}
      className={cn(
        // The tab's own border is transparent: the travelling bar draws the underline, and the
        // base.css fallback colours this border only while the list is unmeasured.
        'relative -mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1',
        className,
      )}
      {...rest}
    >
      {icon ? <Icon icon={icon} size={14} /> : null}
      {children}
      <DisabledReason reason={disabledReason} disabled={disabled} />
    </button>
  )
}

export const Tab = forwardRef(TabInner) as <V extends string = string>(
  props: TabProps<V> & { ref?: ForwardedRef<HTMLButtonElement> },
) => ReturnType<typeof TabInner>

function TabPanelInner<V extends string>({ value, className, children, ...rest }: TabPanelProps<V>, ref: ForwardedRef<HTMLDivElement>) {
  const ctx = useTabs('TabPanel')
  if (ctx.value !== value) return null
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={panelId(ctx.baseId, value)}
      aria-labelledby={tabId(ctx.baseId, value)}
      tabIndex={-1}
      className={cn('pt-4', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export const TabPanel = forwardRef(TabPanelInner) as <V extends string = string>(
  props: TabPanelProps<V> & { ref?: ForwardedRef<HTMLDivElement> },
) => ReturnType<typeof TabPanelInner>
