import { describe, expect, it } from 'vitest'
import { CHANGES_SOMETHING } from './smoke/crawl'

/** The smoke suite clicks what is safe to click, so this list is the whole safety of the run: a control
 * that changes the project, or starts a paid model run, must be on it. An early version missed
 * "Declare Build complete" and clicked it; it was refused only because specs were undecided. */

describe('what the smoke crawler will not click', () => {
  it.each([
    'Declare Build complete',
    'Sign off this stage',
    'Lock these ids',
    'Keep', 'Keep all', 'Discard all',
    'Build the brief',
    'Hand off', 'Hand off anyway',
    'Defer', "Confirm this team's list",
    'Start this document', 'Create', 'Set up project', 'Create project',
    'Restore this version', 'Roll back',
    'Mark as seen', 'Save',
    'Catalogue the documents', 'Export this stage\'s report', 'Gather pipeline evidence',
    'Summarise the documents', 'Analyse the documents', 'Write the registry and index',
    'Draft with Claude', 'Run the review', 'Talk it through', 'Send',
    'Add attendee', 'Remove attendee 1', 'Approve', 'Merge', 'Open folder…', 'New project…',
  ])('skips "%s"', (label) => {
    expect(CHANGES_SOMETHING.test(label), label).toBe(true)
  })

  it.each([
    'Workflow', 'Documents', 'Guide', 'Board', 'How it is going', 'Closing',
    'Needs me', 'I own', "I'm building", 'I check', 'Everything',
    'Next', 'Previous', 'History', 'Refresh', 'Strict check',
    'Show sources for CON-01', '← Back to Workflow', '← Back to the stage', '← Back to the board',
    'What Build inherited', 'How Build is going', 'Checks and gates', 'Plain', 'Technical', 'Cancel',
  ])('is willing to click "%s", which only looks', (label) => {
    expect(CHANGES_SOMETHING.test(label), label).toBe(false)
  })
})
