import { BellRing, CircleHelp, Search, Wrench } from 'lucide-react'
import { cn } from '@/lib/cn'
import { clock, metricValue, signedUsd, usd } from '@/lib/incident/format'
import { IncidentSession, type ActionView, type MetricView } from '@/lib/incident/session'
import { TONE_TEXT } from '@/components/incident/shared'

/**
 * The moment you get paged, taken from the real engine: a fresh session run
 * to its first SLO breach. Nothing here is hand-written, so the preview can
 * never disagree with the incident it advertises.
 */
const session = new IncidentSession()
const transition = session.startIncident()
const view = session.view()
const event = transition.events[0]
const investigate = view.actions.find((action) => action.kind === 'investigate' && action.enabled)
const change = view.actions.find((action) => action.id === 'add-database-replica') ?? view.actions.find((action) => action.kind === 'change' && action.enabled)

export default function IncidentPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl shadow-black/20" aria-label="Preview of the incident at the moment you are paged">
      <div className="flex items-center gap-3 border-b border-failed/40 bg-failed/10 px-4 py-3">
        <BellRing className="size-5 shrink-0 text-failed" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-wide text-failed uppercase">Page · {clock(view.time)}</p>
          <p className="truncate text-sm font-semibold text-fg">SLO breached. You are on call.</p>
        </div>
        <span className="rounded border border-failed/50 bg-failed/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-failed">ACTIVE</span>
      </div>
      <div className="space-y-3 p-4">
        {event && (
          <p className="text-[13px] text-fg">
            <span className="font-medium">{event.title}.</span> <span className="text-fg-muted">{event.description}</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile metric={view.metrics.p99} />
          <Tile metric={view.metrics.availability} />
          <Tile metric={view.metrics.dbCpu} />
          <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
            <p className="truncate text-[11px] text-fg-subtle">{view.budget.headroom === null ? 'Monthly cost' : 'Budget left'}</p>
            <p className="mt-0.5 font-mono text-[15px] font-semibold text-fg tabular-nums">{usd(view.budget.headroom ?? view.budget.monthlyCost)}</p>
          </div>
        </div>
        <div>
          <p className="mb-1.5 font-mono text-[11px] tracking-wide text-fg-subtle uppercase">Your move</p>
          <div className="grid gap-2">
            {investigate && <Choice action={investigate} />}
            {change && <Choice action={change} />}
          </div>
        </div>
      </div>
    </figure>
  )
}

function Tile({ metric }: { metric: MetricView }) {
  const unknown = metric.value === null
  return (
    <div className={cn('rounded-md border px-2.5 py-2', unknown ? 'border-dashed border-border' : 'border-border bg-surface-2')}>
      <p className="truncate text-[11px] text-fg-subtle">{metric.label}</p>
      {unknown ? (
        <p className="mt-0.5 flex items-center gap-1 font-mono text-[15px] font-semibold text-fg-subtle">
          ?? <CircleHelp className="size-3.5" aria-hidden="true" />
        </p>
      ) : (
        <p className={cn('mt-0.5 font-mono text-[15px] font-semibold tabular-nums', TONE_TEXT[metric.tone])}>
          {metricValue(metric.unit, metric.value as number)}
        </p>
      )}
    </div>
  )
}

function Choice({ action }: { action: ActionView }) {
  const Icon = action.kind === 'investigate' ? Search : Wrench
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2">
      <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{action.title}</span>
      <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
        {action.minutes} min{action.monthlyCost !== 0 && ` · ${signedUsd(action.monthlyCost)}/mo`}
      </span>
    </div>
  )
}
