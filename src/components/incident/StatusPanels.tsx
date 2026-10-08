import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Sparkline } from '@/components/metrics/Sparkline'
import { metricValue, ms } from '@/lib/incident/format'
import type { IncidentView, MetricKey, MetricView } from '@/lib/incident/session'
import { Eyebrow, TONE_COLOR, TONE_TEXT } from './shared'

const SYSTEM: MetricKey[] = ['traffic', 'appCpu', 'dbCpu', 'cacheHit', 'queue']
const IMPACT: MetricKey[] = ['p99', 'errors', 'throttled', 'availability']

export function SystemStatus({ view }: { view: IncidentView }) {
  return (
    <section aria-labelledby="system-status" className="rounded-lg border border-border bg-surface p-3">
      <Eyebrow className="mb-2">
        <span id="system-status">System status</span>
      </Eyebrow>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SYSTEM.map((key) => (
          <MetricTile key={key} metric={view.metrics[key]} />
        ))}
      </div>
    </section>
  )
}

export function IncidentImpact({ view }: { view: IncidentView }) {
  const breached = view.sloBreaches.length > 0
  return (
    <section aria-labelledby="incident-impact" className={cn('rounded-lg border bg-surface p-3', breached ? 'border-failed/50' : 'border-border')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>
          <span id="incident-impact">Incident impact</span>
        </Eyebrow>
        <span className={cn('font-mono text-[11px] font-semibold', breached ? 'text-failed' : view.incidentStartedAt === null ? 'text-fg-subtle' : 'text-healthy')} data-testid="slo-status">
          {breached ? `SLO BREACHED: ${view.sloBreaches.map(shortSlo).join(', ')}` : view.incidentStartedAt === null ? 'SLOS MET' : 'SLOS MET AGAIN'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {IMPACT.map((key) => (
          <MetricTile key={key} metric={view.metrics[key]} />
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
    <div className={cn('rounded-md border px-2.5 py-2', unknown ? 'border-dashed border-border bg-transparent' : 'border-border bg-surface-2')} data-testid={`metric-${metric.key}`}>
      <p className="truncate text-[11px] text-fg-subtle">{metric.label}</p>
      {unknown ? (
        <>
          <p className="mt-0.5 flex items-center gap-1 font-mono text-lg font-semibold text-fg-subtle" aria-label={metric.absent ? `${metric.label}: ${metric.hint}` : `${metric.label} unknown`}>
            {metric.absent ? '—' : '??'}
            {!metric.absent && <HelpCircle className="size-3.5" aria-hidden="true" />}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-fg-subtle">{metric.hint}</p>
        </>
      ) : (
        <>
          <p className={cn('mt-0.5 font-mono text-lg font-semibold tabular-nums', TONE_TEXT[metric.tone])}>{metricValue(metric.unit, metric.value as number)}</p>
          {metric.secondary && (
            <p className="font-mono text-[11px] text-fg-subtle">
              {metric.secondary.label} {ms(metric.secondary.value)}
            </p>
          )}
          <Sparkline values={metric.series} className="mt-1 h-5 w-full" color={TONE_COLOR[metric.tone]} min={metric.unit === 'ratio' ? 0 : undefined} />
        </>
      )}
    </div>
  )
}
