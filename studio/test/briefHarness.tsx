import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { BriefForm } from '../src/components/BriefForm'
import { clearAllBriefForms } from '../src/briefFormStore'
import { installBriefApi } from './briefFixtures'

export async function openBrief(
  over: Record<string, unknown> = {},
  candidates?: Parameters<typeof installBriefApi>[1],
  props: { projectPath?: string; actor?: string } = {},
  reset = true,
) {
  if (reset) clearAllBriefForms()
  const studio = installBriefApi(over, candidates)
  const onOpenDocument = vi.fn()
  const view = render(<BriefForm projectPath={props.projectPath ?? '/p'} actor={props.actor ?? '@matt'} onOpenDocument={onOpenDocument} />)
  await screen.findByTestId('brief-form')
  return { studio, onOpenDocument, view }
}

export const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
export const buttonNamed = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
export const click = (name: string) => fireEvent.click(box(name))
export const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

export function fillLogistics() {
  type('Client name', 'Acme Insurance')
  type('Date, time and location', '12 Nov, 10:00, Leeds')
  type('Duration', '90 minutes')
  type('Attendee 1 name', 'Jo Client')
  type('Attendee 1 role', 'Head of Claims')
}

export function pickDocuments(...ids: string[]) {
  for (const id of ids) click(`Load-bearing ${id}`)
}

export function addDecision(text: string) {
  type('Decision text', text)
  fireEvent.click(buttonNamed('Add decision'))
}

/** Satisfies every rule with the default candidates: 3 documents, 1 added decision, full logistics. */
export function completeForm() {
  pickDocuments('DOC-001', 'DOC-002', 'DOC-003')
  addDecision('Who owns intake?')
  fillLogistics()
}

export const reason = () => screen.getByTestId('brief-build-reason').textContent
