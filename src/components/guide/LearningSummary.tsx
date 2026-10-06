import { Check } from 'lucide-react'
import type { LearningSummaryDef } from '@/lib/guide/types'

/** "You learned": the topic and a few short takeaways. */
export function LearningSummary({ summary }: { summary: LearningSummaryDef }) {
  return (
    <div>
      <p className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">You learned</p>
      <p className="mt-1 text-[15px] font-semibold text-fg">{summary.topic}</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {summary.points.map((p) => (
          <li key={p.term} className="flex gap-2 text-[13px] text-fg-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>
              <span className="font-medium text-fg">{p.term}</span>
              {p.detail && <span> → {p.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
