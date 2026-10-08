import { CheckCircle2, CircleHelp } from 'lucide-react'
import { clock } from '@/lib/incident/format'
import type { IncidentView } from '@/lib/incident/session'
import { Eyebrow } from './shared'

/** What the operator knows, and, as importantly, what they do not know yet. */
export function KnowledgePanel({ view }: { view: IncidentView }) {
  return (
    <section aria-labelledby="what-you-know" className="rounded-lg border border-border bg-surface p-3">
      <Eyebrow className="mb-2">
        <span id="what-you-know">What you know</span>
      </Eyebrow>
      {view.known.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Only the dashboards above. You have not investigated anything yet.</p>
      ) : (
        <ul className="space-y-2" aria-label="Known facts">
          {view.known.map((fact) => (
            <li key={fact.id} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-healthy" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-medium text-fg">{fact.text}</p>
                {fact.description && <p className="text-xs leading-relaxed text-fg-muted">{fact.description}</p>}
                <p className="font-mono text-[10px] text-fg-subtle">
                  learned {clock(fact.learnedAt)} · {fact.learnedBy.toLowerCase()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {view.unknown.length > 0 && (
        <>
          <Eyebrow className="mt-3 mb-1.5">Unknown</Eyebrow>
          <ul className="space-y-1.5" aria-label="Unknowns">
            {view.unknown.map((fact) => (
              <li key={fact.id} className="flex gap-2 text-[13px]">
                <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="text-fg-muted">
                  {fact.label}
                  {fact.revealedBy.length > 0 && <span className="text-fg-subtle"> · {fact.revealedBy.join(' or ').toLowerCase()} to find out</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
