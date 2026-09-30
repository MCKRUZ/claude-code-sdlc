// Runs for every test file (main-process tests included — importing this costs them nothing,
// since cleanup() is a no-op when nothing was rendered). Without it, a jsdom component test
// that renders more than once in the same file leaves every earlier render's DOM in place, and
// a query like getByRole that expects exactly one match starts seeing duplicates from a
// PRIOR test's leftover markup.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom does not implement Element.scrollTo (it is a real limitation, not a bug in the
// component under test — ChatPanel.tsx's autoscroll-to-latest-message effect calls it on
// every render). A no-op stub is enough for a component test, which cares about what rendered,
// not about actual scroll physics jsdom never had to begin with.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}
