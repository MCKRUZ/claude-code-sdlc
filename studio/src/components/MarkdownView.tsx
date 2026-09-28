import type { ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** A document's markdown, drawn for reading. Read mode only — edit mode shows the source, since
 * the source is what gets saved.
 *
 * These documents are edited by teammates, so nothing in one may reach the app as behaviour:
 *  - raw HTML is dropped (`skipHtml`), which also hides the `<!-- ... -->` scaffolding
 *    comments templates carry;
 *  - a link is drawn as its text, never as an anchor, so nothing in a document can navigate the
 *    app window — the address stays in a tooltip for anyone who wants it;
 *  - an image is drawn as its description, so a document cannot make the app fetch a remote URL.
 */

const Heading = (className: string) =>
  function HeadingTag({ children }: ComponentProps<'h3'>) {
    return <h4 className={className}>{children}</h4>
  }

const components: Components = {
  h1: Heading('mt-3 text-sm font-semibold text-slate-900 first:mt-0'),
  h2: Heading('mt-3 text-sm font-semibold text-slate-900 first:mt-0'),
  h3: Heading('mt-3 text-sm font-semibold text-slate-800 first:mt-0'),
  h4: Heading('mt-2 text-sm font-medium text-slate-800 first:mt-0'),
  h5: Heading('mt-2 text-sm font-medium text-slate-700 first:mt-0'),
  h6: Heading('mt-2 text-sm font-medium text-slate-700 first:mt-0'),
  p: ({ children }) => <p className="mt-1.5 text-sm leading-relaxed text-slate-800 first:mt-0">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={`mt-1.5 space-y-0.5 pl-5 text-sm text-slate-800 first:mt-0 ${
      className?.includes('contains-task-list') ? 'list-none pl-0' : 'list-disc'}`}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-sm text-slate-800 first:mt-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  // A glyph, not a disabled <input>: DocumentView's rule is that no control exists outside edit
  // mode, and a disabled checkbox still says "you could tick this here".
  input: ({ type, checked }) =>
    type === 'checkbox'
      ? <span role="img" aria-label={checked ? 'done' : 'not done'} className="mr-2 text-slate-500">{checked ? '☑' : '☐'}</span>
      : null,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-800">{children}</code>,
  pre: ({ children }) => (
    <pre className="mt-1.5 overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-xs text-slate-800 first:mt-0">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-1.5 border-l-2 border-slate-300 pl-3 text-sm italic text-slate-600 first:mt-0">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-slate-200" />,
  table: ({ children }) => (
    <div className="mt-1.5 overflow-x-auto first:mt-0">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
  th: ({ children }) => <th className="border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700">{children}</th>,
  td: ({ children }) => <td className="border border-slate-200 px-2.5 py-1.5 align-top text-slate-800">{children}</td>,
  a: ({ href, children }) => <span className="underline decoration-slate-300" title={href}>{children}</span>,
  img: ({ alt }) => (alt ? <span className="italic text-slate-500">[image: {alt}]</span> : null),
}

export function MarkdownView({ source }: { source: string }) {
  if (source.trim() === '') return null
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
      {source}
    </ReactMarkdown>
  )
}
