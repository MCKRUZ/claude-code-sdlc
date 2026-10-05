import { useState } from 'react'
import type { BriefContradiction, BriefDocument, BriefQuestion } from '../../shared/types'
import { PANEL_SECONDARY_BUTTON } from './activityPanelBits'
import { Reason, Section } from './briefBits'

interface PickProps<T> {
  items: T[]
  ticked: string[]
  limit: number
  onToggle: (id: string) => void
}

const CHECKBOX_ROW = 'flex items-start gap-2'

export function ContradictionsSection({ items, ticked, limit, onToggle }: PickProps<BriefContradiction>) {
  const count = items.filter((c) => ticked.includes(c.id)).length
  const full = count >= limit
  return (
    <Section title="Contradictions" counter={`${count} of ${limit}`} counterId="brief-contradictions-counter">
      {full && <Reason>{`The page holds ${limit} contradictions.`}</Reason>}
      <ul className="space-y-2">
        {items.map((item) => (
          <ContradictionRow
            key={item.id}
            item={item}
            checked={ticked.includes(item.id)}
            disabled={full && !ticked.includes(item.id)}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </ul>
    </Section>
  )
}

function ContradictionRow({
  item, checked, disabled, onToggle,
}: { item: BriefContradiction; checked: boolean; disabled: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <li data-testid="brief-contradiction" data-id={item.id} className="rounded-lg border border-slate-100 px-3 py-2">
      <div className={CHECKBOX_ROW}>
        <input type="checkbox" aria-label={`Include ${item.id}`} checked={checked} disabled={disabled} onChange={onToggle} className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1 text-xs text-slate-700">
          <p>
            <span className="font-medium text-slate-900">{item.id}</span> {item.title}{' '}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">{item.severity}</span>
          </p>
          <p>{item.question}</p>
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} sources for ${item.id}`}
            onClick={() => setOpen(!open)}
            className={PANEL_SECONDARY_BUTTON}
          >
            {open ? 'Hide sources' : 'Show sources'}
          </button>
          {open && <Sources item={item} />}
        </div>
      </div>
    </li>
  )
}

function Sources({ item }: { item: BriefContradiction }) {
  return (
    <ul className="space-y-1">
      {item.sources.map((s) => (
        <li key={s.side} className="border-l-2 border-slate-200 pl-2">
          <span className="font-medium text-slate-800">{s.document}</span>
          <q className="ml-1 italic">{s.quote}</q>
        </li>
      ))}
    </ul>
  )
}

/** The workshop agenda blocks in the order the candidates first mention them. */
function byBlock(questions: BriefQuestion[]): Array<[string, BriefQuestion[]]> {
  return questions.reduce<Array<[string, BriefQuestion[]]>>((groups, q) => {
    const at = groups.findIndex(([block]) => block === q.block)
    if (at === -1) return [...groups, [q.block, [q]]]
    return groups.map((g, i) => (i === at ? [g[0], [...g[1], q]] : g))
  }, [])
}

export function QuestionsSection({ items, ticked, limit, onToggle }: PickProps<BriefQuestion>) {
  const inRoom = items.filter((q) => q.route !== 'pre-workshop')
  const emailed = items.filter((q) => q.route === 'pre-workshop')
  const count = inRoom.filter((q) => q.route === 'workshop' && ticked.includes(q.id)).length
  const full = count >= limit
  return (
    <Section title="Questions" counter={`${count} of ${limit}`} counterId="brief-questions-counter">
      {full && <Reason>{`The page holds ${limit} questions.`}</Reason>}
      {byBlock(inRoom).map(([block, questions]) => (
        <div key={block} data-testid="brief-question-block" data-block={block} className="space-y-1">
          <h5 className="text-xs font-medium text-slate-600">{block}</h5>
          <ul className="space-y-1">
            {questions.map((q) => (
              <QuestionRow key={q.id} q={q} checked={ticked.includes(q.id)} full={full} onToggle={() => onToggle(q.id)} />
            ))}
          </ul>
        </div>
      ))}
      {emailed.length > 0 && <EmailedQuestions items={emailed} />}
    </Section>
  )
}

function QuestionRow({ q, checked, full, onToggle }: { q: BriefQuestion; checked: boolean; full: boolean; onToggle: () => void }) {
  const interview = q.route === 'interview'
  return (
    <li className={CHECKBOX_ROW}>
      <input
        type="checkbox"
        aria-label={`Include ${q.id}`}
        checked={!interview && checked}
        disabled={interview || (full && !checked)}
        onChange={onToggle}
        className="mt-0.5"
      />
      <span className="text-xs text-slate-700">
        <span className="font-medium text-slate-900">{q.id}</span> {q.question}
        {interview && <span className="block text-slate-500">Neither in the room nor emailed.</span>}
      </span>
    </li>
  )
}

function EmailedQuestions({ items }: { items: BriefQuestion[] }) {
  return (
    <div data-testid="brief-emailed-questions" className="space-y-1">
      <h5 className="text-xs font-medium text-slate-600">Email these before the workshop</h5>
      <Reason>These are not placed on the page; the brief reports them as emailed instead.</Reason>
      <ul className="space-y-1">
        {items.map((q) => (
          <li key={q.id} className="text-xs text-slate-700">
            <span className="font-medium text-slate-900">{q.id}</span> {q.question}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DocumentsSection({
  items, ticked, range, onToggle,
}: { items: BriefDocument[]; ticked: string[]; range: [number, number]; onToggle: (id: string) => void }) {
  const count = items.filter((d) => ticked.includes(d.id)).length
  const full = count >= range[1]
  return (
    <Section title="Load-bearing documents" counter={`${count} of ${range[0]} to ${range[1]}`} counterId="brief-documents-counter">
      {full && <Reason>{`The page names at most ${range[1]} load-bearing documents.`}</Reason>}
      <ul className="space-y-1">
        {items.map((d) => (
          <li key={d.id} className={CHECKBOX_ROW}>
            <input
              type="checkbox"
              aria-label={`Load-bearing ${d.id}`}
              checked={ticked.includes(d.id)}
              disabled={full && !ticked.includes(d.id)}
              onChange={() => onToggle(d.id)}
              className="mt-0.5"
            />
            <span className="text-xs text-slate-700">
              <span className="font-medium text-slate-900">{d.id}</span> {d.filename}
              {d.topics && <span className="text-slate-500"> ({d.topics})</span>}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
