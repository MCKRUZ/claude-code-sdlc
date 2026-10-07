// @vitest-environment jsdom
/** Settings › Appearance, round 2 (M3): the note that the opening quietens, and the ghost
 * "Play the opening again" that resets the project's familiarity counter — disabled, with its
 * reason, outside a project. No `<input>` is added (the a11y and board pins count them). */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppearanceSection } from '../src/components/AppearanceSection'
import { ProjectKeyProvider } from '../src/motion/projectKey'
import { motion, opensStorageKey } from '../src/motion/motion'
import { clearToasts, getSnapshot } from '../src/ui/toastStore'

afterEach(() => {
  clearToasts()
  localStorage.clear()
})

describe('AppearanceSection — the opening flourishes', () => {
  it('says the flourishes quieten after ten opens, and offers to play the opening again as a button', () => {
    render(<ProjectKeyProvider value="/p"><AppearanceSection /></ProjectKeyProvider>)
    expect(screen.getByText('Opening flourishes quieten after the first ten opens.')).toBeTruthy()
    const button = screen.getByRole('button', { name: /Play the opening again/ }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(document.querySelectorAll('input')).toHaveLength(0)
  })

  it('resets the project\'s counter: twelve opens (settled) become a first open again', () => {
    for (let i = 0; i < 12; i += 1) motion.recordOpen('/p')
    expect(motion.familiarity('/p')).toBe('settled')
    render(<ProjectKeyProvider value="/p"><AppearanceSection /></ProjectKeyProvider>)
    fireEvent.click(screen.getByRole('button', { name: /Play the opening again/ }))
    expect(motion.familiarity('/p')).toBe('full')
    expect(localStorage.getItem(opensStorageKey('/p'))).toBeNull()
    expect(getSnapshot().length).toBe(1)
  })

  it('outside a project the button is disabled and says why', () => {
    render(<AppearanceSection />)
    const button = screen.getByRole('button', { name: /Play the opening again/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.textContent).toContain('Open a project first')
  })
})
