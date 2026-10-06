import { CheckCircle2, Gauge, Scale, Target } from 'lucide-react'
import type { Challenge } from '@/lib/architecture'

/**
 * The problem in full: requirements, qualities, constraints and what the
 * evaluator looks at. Used on the details page and in the designer sidebar.
 */
export function ChallengeBrief({ challenge, compact = false }: { challenge: Challenge; compact?: boolean }) {
  const h = compact ? 'font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase' : 'text-[13px] font-semibold text-fg'
  return (
    <div className={compact ? 'space-y-5' : 'grid gap-8 md:grid-cols-2'}>
      <section>
        <h3 className={h}>Functional requirements</h3>
        <ul className="mt-2 space-y-1.5">
          {challenge.functional.map((r) => (
            <li key={r} className="flex gap-2 text-[13px] text-fg-muted">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className={h}>Non-functional requirements</h3>
        <dl className="mt-2 space-y-1.5">
          {challenge.nonFunctional.map((r) => (
            <div key={r.label} className="flex gap-2 text-[13px]">
              <Gauge className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
              <dt className="shrink-0 font-medium text-fg">{r.label}</dt>
              <dd className="text-fg-muted">{r.target}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3 className={h}>Constraints</h3>
        <dl className="mt-2 space-y-1.5">
          {challenge.constraints.map((r) => (
            <div key={r.label} className="flex gap-2 text-[13px]">
              <Scale className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
              <dt className="shrink-0 font-medium text-fg">{r.label}</dt>
              <dd className="text-fg-muted">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3 className={h}>What the evaluator considers</h3>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {challenge.criteria.map((c) => (
            <li
              key={c}
              className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-fg-muted"
            >
              <Target className="size-3 text-fg-subtle" aria-hidden="true" />
              {c}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
