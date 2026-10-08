import { Clock, Wallet, Layers } from 'lucide-react'
import { cn } from '@/lib/cn'
import { clock, usd } from '@/lib/incident/format'
import type { IncidentView, TimelineEntry } from '@/lib/incident/session'

const STATUS: Record<IncidentView['status'], { label: string; className: string }> = {
  quiet: { label: 'MONITORING', className: 'border-border bg-surface-2 text-fg-muted' },
  active: { label: 'ACTIVE · SLO BREACHED', className: 'border-failed/50 bg-failed/15 text-failed animate-pulse' },
  holding: { label: 'ACTIVE · SLOS HOLDING', className: 'border-warning/50 bg-warning/10 text-warning' },
  ended: { label: 'INCIDENT CLOSED', className: 'border-border bg-surface-2 text-fg-muted' },
}

export function IncidentHeader({ title, view }: { title: string; view: IncidentView }) {
  const status = STATUS[view.status]
  const { budget, complexity } = view
  return (
    <header className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-wide text-fg-subtle uppercase">Incident</p>
          <h1 className="truncate text-lg font-semibold tracking-tight text-fg">{title}</h1>
        </div>
        <div className="flex items-center gap-2" aria-label="Incident clock">
          <Clock className="size-4 text-fg-subtle" aria-hidden="true" />
          <span className="font-mono text-2xl font-semibold tabular-nums text-fg" data-testid="clock">
            {clock(view.time)}
          </span>
          <span className="text-xs text-fg-subtle">of {clock(view.maxTime)}</span>
        </div>
        <span className={cn('rounded border px-2 py-1 font-mono text-[11px] font-semibold tracking-wide', status.className)} data-testid="incident-status">
          {status.label}
        </span>
        <div className="flex items-center gap-2 text-sm" data-testid="budget">
          <Wallet className="size-4 text-fg-subtle" aria-hidden="true" />
          <span className="text-fg-muted">Budget</span>
          <span className={cn('font-mono tabular-nums', budget.over ? 'text-failed' : 'text-fg')}>
            {usd(budget.monthlyCost)} / {budget.limit === null ? '—' : usd(budget.limit)}
          </span>
          {budget.headroom !== null && (
            <span className={cn('font-mono text-xs', budget.over ? 'text-failed' : 'text-fg-subtle')}>
              {budget.over ? `${usd(-budget.headroom)} over` : `${usd(budget.headroom)} left`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm" title="How much the on-call team can safely operate">
          <Layers className="size-4 text-fg-subtle" aria-hidden="true" />
          <span className="text-fg-muted">Complexity</span>
          <span className="font-mono tabular-nums text-fg">
            {complexity.score}
            {complexity.limit !== null && ` / ${complexity.limit}`}
          </span>
        </div>
      </div>
      <TimeRuler view={view} />
    </header>
  )
}

const MARK: Partial<Record<TimelineEntry['kind'], string>> = {
  event: 'bg-warning',
  decision: 'bg-accent',
  constraint: 'bg-failed',
  rejected: 'bg-fg-subtle',
}

/** The whole incident as a ruler: where you are, what has happened, how much is left. */
function TimeRuler({ view }: { view: IncidentView }) {
  const at = (time: number) => `${(time / view.maxTime) * 100}%`
  const marks = view.timeline.filter((entry) => MARK[entry.kind])
  return (
    <div className="border-t border-border px-4 pt-2 pb-3">
      <div className="relative h-2 rounded-full bg-surface-3" role="progressbar" aria-label="Logical time" aria-valuemin={0} aria-valuemax={view.maxTime} aria-valuenow={view.time} aria-valuetext={clock(view.time)}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-fg/25 transition-[width] duration-700" style={{ width: at(view.time) }} />
        {view.incidentStartedAt !== null && <div className="absolute inset-y-0 w-px bg-failed" style={{ left: at(view.incidentStartedAt) }} />}
        {marks.map((entry, index) => (
          <span
            key={`${entry.kind}-${entry.time}-${index}`}
            className={cn('absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface', MARK[entry.kind])}
            style={{ left: at(entry.time) }}
            title={`${clock(entry.time)} ${entry.title}`}
          />
        ))}
        <span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-fg transition-[left] duration-700" style={{ left: at(view.time) }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-fg-subtle">
        {[0, 15, 30, 45].filter((t) => t <= view.maxTime).map((t) => (
          <span key={t}>{clock(t)}</span>
        ))}
      </div>
    </div>
  )
}
