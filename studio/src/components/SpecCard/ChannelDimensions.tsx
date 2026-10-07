// Channel acceptance dimensions (togo-command-center.md §3.3): from `check_channel.py --json` when
// the spec binds a channel; "no channel bound" otherwise — never an empty list styled as zero. The
// lint is ADVISORY (exit 0) and never changes the DoR verdict; the rows are the plugin's own
// `dimensions[]` with its `covered` flag, `uncovered[]` and `notes[]` verbatim.
import type { ChannelCheckView, SourcedBlock } from '../../../shared/types'
import { NO_CHANNEL_BOUND } from '../../../shared/reasons'
import { Chip, Eyebrow } from '../../ui'

export const CHANNEL_TITLE = 'Channel acceptance dimensions'

export function ChannelDimensions({ channel }: { channel: SourcedBlock<ChannelCheckView> | null }) {
  const view = channel?.data ?? null
  return (
    <section aria-label={CHANNEL_TITLE} data-testid="channel-dimensions" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow as="h3">{CHANNEL_TITLE}</Eyebrow>
        {view && <Chip tone="mono" casing="identifier">{view.channel ?? NO_CHANNEL_BOUND}</Chip>}
      </div>
      {!channel ? (
        <p className="text-xs text-ink-3" data-testid="channel-none">{NO_CHANNEL_BOUND}</p>
      ) : !channel.ok || !view ? (
        <p className="text-xs text-ink-3">{channel.error ?? 'no data'} <span className="font-mono text-[10px]">{channel.source}</span></p>
      ) : !view.bound ? (
        <p className="text-xs text-ink-3" data-testid="channel-none">{NO_CHANNEL_BOUND}</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-label="Dimensions">
            {view.dimensions.map((d) => (
              <li key={d.id} data-dimension={d.id} data-covered={d.covered ? 'true' : 'false'}>
                <Chip tone={d.covered ? 'ok' : 'warn'} casing="identifier" dot>{d.id}</Chip>
              </li>
            ))}
          </ul>
          {view.uncovered.length > 0 && <p className="text-xs text-status-warn-ink">uncovered: {view.uncovered.join(', ')}</p>}
          {view.notes.map((n) => <p key={n} className="text-xs text-ink-2">{n}</p>)}
          <p className="font-mono text-[10px] text-ink-3" aria-label="source">{channel.source}{view.advisory ? ' · advisory' : ''}</p>
        </>
      )}
    </section>
  )
}
