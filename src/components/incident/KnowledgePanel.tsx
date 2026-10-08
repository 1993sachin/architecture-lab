import { CheckCircle2, CircleHelp, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Sparkline } from '@/components/metrics/Sparkline'
import { clock, metricValue } from '@/lib/incident/format'
import { interpretFact, unknownNote } from '@/lib/incident/explain'
import type { Hypothesis } from '@/lib/incident/reasoning'
import type { IncidentView, MetricKey, UnknownFact } from '@/lib/incident/session'
import { LearnMetric } from './Learn'
import { Eyebrow, TONE_COLOR, TONE_TEXT } from './shared'

/** Supporting signals: what explains the impact, as opposed to the impact itself. */
const SUPPORTING: MetricKey[] = ['traffic', 'appCpu', 'dbCpu', 'cacheHit', 'queue']

/**
 * What the operator knows, and, as importantly, what they do not know yet and
 * how to find out. Hidden values never get here: the view only carries what
 * the engine says is observable.
 */
export function KnowledgePanel({ view, causes, onInvestigate }: { view: IncidentView; causes: Hypothesis[]; onInvestigate?: (actionId: string) => void }) {
  const signals = SUPPORTING.map((key) => view.metrics[key]).filter((metric) => metric.known)
  // One entry per investigation, listing everything it would reveal.
  const byAction = new Map<string, UnknownFact[]>()
  for (const fact of view.unknown) {
    const key = fact.revealedBy[0] ?? ''
    byAction.set(key, [...(byAction.get(key) ?? []), fact])
  }
  return (
    <section aria-labelledby="what-you-know" className="rounded-lg border border-border bg-surface p-4">
      <Eyebrow className="mb-2 text-fg">
        <span id="what-you-know">What you know</span>
      </Eyebrow>
      <ul className="space-y-1.5" aria-label="Known signals">
        {signals.map((metric) => (
          <li key={metric.key} className="grid grid-cols-[auto_1fr_auto_3.5rem] items-center gap-2 text-[13px]" data-testid={`metric-${metric.key}`}>
            <CheckCircle2 className="size-3.5 text-healthy" aria-hidden="true" />
            <LearnMetric metricKey={metric.key} view={view} causes={causes} onCheck={onInvestigate} className="flex items-center gap-1 justify-self-start text-left text-fg-muted underline decoration-dotted decoration-fg-subtle underline-offset-2 hover:text-accent">
              {metric.label}
            </LearnMetric>
            <span className={cn('font-mono font-semibold tabular-nums', TONE_TEXT[metric.tone])}>{metricValue(metric.unit, metric.value as number)}</span>
            <Sparkline values={metric.series.slice(-12)} className="h-4 w-14" color={TONE_COLOR[metric.tone]} min={metric.unit === 'ratio' ? 0 : undefined} />
          </li>
        ))}
      </ul>
      {view.known.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3" aria-label="Known facts">
          {view.known.map((fact) => (
            <li key={fact.id} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-healthy" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-medium text-fg">{fact.text}</p>
                <FactMeaning text={interpretFact(fact, view) ?? fact.description} />
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
          <Eyebrow className="mt-4 mb-1.5 text-fg">What you don’t know</Eyebrow>
          <ul className="space-y-2.5" aria-label="Unknowns">
            {[...byAction.entries()].map(([title, facts]) => {
              const action = view.actions.find((candidate) => candidate.title === title)
              const notes = facts.map((fact) => unknownNote(fact.id, view)).filter((note): note is string => note !== null)
              return (
                <li key={title}>
                  <ul className="space-y-0.5">
                    {facts.map((fact) => (
                      <li key={fact.id} className="flex gap-2 text-[13px] text-fg-muted">
                        <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                        {fact.label}
                      </li>
                    ))}
                  </ul>
                  {notes[0] && <p className="mt-0.5 ml-5.5 text-[12px] leading-snug text-fg-subtle">{notes[0]}</p>}
                  {title && (
                    <button
                      type="button"
                      disabled={!action?.enabled || !onInvestigate}
                      onClick={() => action && onInvestigate?.(action.id)}
                      className="mt-1 ml-5.5 inline-flex items-center gap-1 text-[12px] font-medium text-info hover:underline disabled:text-fg-subtle disabled:no-underline"
                    >
                      <Search className="size-3" aria-hidden="true" />
                      {title}
                      {action && <span className="font-normal text-fg-subtle">· {action.minutes} min</span>}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

/** What a learned fact means, not just its number. */
function FactMeaning({ text }: { text?: string | null }) {
  if (!text) return null
  return <p className="text-xs leading-relaxed text-fg-muted">{text}</p>
}
