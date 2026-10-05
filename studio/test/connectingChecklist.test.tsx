// @vitest-environment jsdom
/** The connecting checklist's own list keys (PR #76 review finding #7).
 *
 * Two of the three step labels ChatPanel renders embed dynamic data (the project's name, the
 * current document's title) that changes mid-sequence as real calls resolve. Keying each `<li>`
 * by `step.label` means that text change IS a key change, so React discards and remounts the
 * row instead of diffing it in place — a visible flicker of the checkmark/circle exactly during
 * the sequence this component exists to make feel smooth. */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectingChecklist, type ConnectingStep } from '../src/components/ConnectingChecklist'

describe('ConnectingChecklist — finding #7: a stable key independent of label text', () => {
  it('does not remount a step\'s <li> when its own label text changes (e.g. once the project name or document title resolves)', () => {
    const before: ConnectingStep[] = [
      { label: 'Connecting to Claude Code', done: false },
      { label: 'Reading the project', done: false },
      { label: 'Loading the current file', done: false },
    ]
    const { container, rerender } = render(<ConnectingChecklist steps={before} />)
    const beforeNodes = Array.from(container.querySelectorAll('li'))
    expect(beforeNodes).toHaveLength(3)

    const after: ConnectingStep[] = [
      { label: 'Connecting to Claude Code', done: true },
      { label: 'Reading demo', done: false }, // label text changed mid-sequence
      { label: 'Loading requirements.md', done: false }, // label text changed too
    ]
    rerender(<ConnectingChecklist steps={after} />)
    const afterNodes = Array.from(container.querySelectorAll('li'))
    expect(afterNodes).toHaveLength(3)

    // Same underlying DOM nodes, not freshly created ones — proves React diffed each row in
    // place rather than discarding and remounting it because its key (the label text) changed.
    expect(afterNodes[0]).toBe(beforeNodes[0])
    expect(afterNodes[1]).toBe(beforeNodes[1])
    expect(afterNodes[2]).toBe(beforeNodes[2])
  })
})
