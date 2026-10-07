// Row #29 — Scene crossfade (studio-upgrade-2 I8). Inside `SceneShell`: table → canvas with the
// table underneath, and Graph ↔ Table inside the fixed-height body. Outgoing `CROSSFADE_OUT`
// (`dur-1`), incoming `CROSSFADE_IN` (`dur-2`) — opacity only, so reduced motion keeps a capped
// fade. `onOutgoingHidden` fires the moment the outgoing surface is fully transparent: only then
// may the shell dispose a canvas, and only once `claimCanvas` has handed over, so there is never
// a second live WebGL canvas. Disabled (`MODE=test`, `off`): the DOM is not touched at all and
// `onOutgoingHidden` fires at once — the end state is a cold reload's, and `data-surface` (the
// shell's own attribute) has already flipped synchronously regardless of this row.
import type { Choreo, SceneCrossfadeRefs } from '../contract'
import { CROSSFADE_IN, CROSSFADE_OUT } from '../presets'
import { fadeDuration, timelineFor } from './_shared'

export type { SceneCrossfadeRefs }

export const sceneCrossfade: Choreo<SceneCrossfadeRefs> = {
  name: 'sceneCrossfade',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!ctx.enabled) {
      refs.onOutgoingHidden?.()
      return tl
    }
    const outS = fadeDuration(ctx, CROSSFADE_OUT.to.duration as number)
    const inS = fadeDuration(ctx, CROSSFADE_IN.to.duration as number)
    if (refs.outgoing) {
      tl.fromTo(refs.outgoing, CROSSFADE_OUT.from, {
        ...CROSSFADE_OUT.to, duration: outS, onComplete: () => refs.onOutgoingHidden?.(),
      }, 0)
    } else {
      tl.call(() => refs.onOutgoingHidden?.(), [], 0)
    }
    if (refs.incoming) {
      // `clearProps` so a settled surface carries no inline opacity — the same DOM a reload gives.
      tl.fromTo(refs.incoming, CROSSFADE_IN.from, { ...CROSSFADE_IN.to, duration: inS, clearProps: 'opacity' }, 0)
    }
    return tl
  },
}
