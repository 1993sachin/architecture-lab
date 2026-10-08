import { HelpCircle, Info } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Sparkline } from '@/components/metrics/Sparkline'
import { metricValue, ms } from '@/lib/incident/format'
import type { Hypothesis } from '@/lib/incident/reasoning'
import type { IncidentView, MetricKey, MetricView } from '@/lib/incident/session'
import { LearnConcept, LearnMetric } from './Learn'
import { Eyebrow, TONE_COLOR, TONE_TEXT } from './shared'

const IMPACT: MetricKey[] = ['p99', 'errors', 'throttled', 'availability']

interface ImpactProps {
  view: IncidentView
  causes: Hypothesis[]
  onCheck?: (actionId: string) => void
}

/** What users feel. Every tile explains itself when clicked. */
export function IncidentImpact({ view, causes, onCheck }: ImpactProps) {
  const breached = view.sloBreaches.length > 0
  return (
    <section aria-labelledby="incident-impact" className={cn('rounded-lg border bg-surface p-3', breached ? 'border-failed/50' : 'border-border')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Eyebrow className="flex items-center gap-1">
          <span id="incident-impact">Incident impact</span>
          <LearnConcept id="impact" />
        </Eyebrow>
        <span className="flex items-center gap-1">
          <span className={cn('font-mono text-[11px] font-semibold', breached ? 'text-failed' : view.incidentStartedAt === null ? 'text-fg-subtle' : 'text-healthy')} data-testid="slo-status">
            {breached ? `SLO BREACHED: ${view.sloBreaches.map(shortSlo).join(', ')}` : view.incidentStartedAt === null ? 'SLOS MET' : 'SLOS MET AGAIN'}
          </span>
          <LearnConcept id="slo" />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {IMPACT.map((key) => (
          <LearnMetric
            key={key}
            metricKey={key}
            view={view}
            causes={causes}
            onCheck={onCheck}
            className="group block rounded-md text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <MetricTile metric={view.metrics[key]} />
          </LearnMetric>
        ))}
      </div>
    </section>
  )
}

function shortSlo(description: string): string {
  return description.replace(/\s*\(.*\)$/, '').replace(/ SLO$/, '')
}

export function MetricTile({ metric }: { metric: MetricView }) {
  const unknown = metric.value === null
  return (
    <span
      className={cn('block rounded-md border px-2.5 py-2 transition-colors group-hover:border-accent/60', unknown ? 'border-dashed border-border bg-transparent' : 'border-border bg-surface-2')}
      data-testid={`metric-${metric.key}`}
    >
      <span className="flex items-center justify-between gap-1 text-[11px] text-fg-subtle">
        <span className="truncate">{metric.label}</span>
        <Info className="size-3 shrink-0 opacity-60 group-hover:text-accent group-hover:opacity-100" aria-hidden="true" />
      </span>
      {unknown ? (
        <>
          <span className="mt-0.5 flex items-center gap-1 font-mono text-lg font-semibold text-fg-subtle">
            {metric.absent ? '—' : '??'}
            {!metric.absent && <HelpCircle className="size-3.5" aria-hidden="true" />}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-fg-subtle">{metric.hint}</span>
        </>
      ) : (
        <>
          <span className={cn('mt-0.5 block font-mono text-lg font-semibold tabular-nums', TONE_TEXT[metric.tone])}>{metricValue(metric.unit, metric.value as number)}</span>
          {metric.secondary && (
            <span className="block font-mono text-[11px] text-fg-subtle">
              {metric.secondary.label} {ms(metric.secondary.value)}
            </span>
          )}
          <Sparkline values={metric.series} className="mt-1 h-5 w-full" color={TONE_COLOR[metric.tone]} min={metric.unit === 'ratio' ? 0 : undefined} />
        </>
      )}
    </span>
  )
}
