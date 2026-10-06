import { cn } from '@/lib/cn'
import { SERVICE_LABELS, summarizeMetrics, type QueueStatus, type ResilienceState } from '@/lib/simulation/resilience'

const STATUS: Record<QueueStatus, { label: string; text: string; chip: string }> = {
  queued: { label: 'Queued', text: 'text-info', chip: 'border-info/40 bg-info/10 text-info' },
  processing: { label: 'Processing', text: 'text-degraded', chip: 'border-degraded/40 bg-degraded/10 text-degraded' },
  completed: { label: 'Completed', text: 'text-healthy', chip: 'border-healthy/40 bg-healthy/10 text-healthy' },
}

/** Messages in the order-fulfilment queue and where each one is. */
export function QueueView({ sim }: { sim: ResilienceState }) {
  const { queue } = summarizeMetrics(sim)
  const counts: Record<QueueStatus, number> = { queued: queue.queued, processing: queue.processing, completed: queue.completed }
  const visible = sim.queue.slice(-12)
  const waiting = sim.queue.find((m) => m.status === 'queued' && m.waitingOn)

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-3 gap-1 text-center">
        {(Object.keys(STATUS) as QueueStatus[]).map((s) => (
          <div key={s} className="rounded-md border border-border bg-surface-2 px-1 py-1.5">
            <dt className="text-[10.5px] text-fg-subtle">{STATUS[s].label}</dt>
            <dd className={cn('font-mono text-sm font-medium tabular-nums', STATUS[s].text)}>{counts[s]}</dd>
          </div>
        ))}
      </dl>
      {visible.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="Recent queue messages">
          {visible.map((msg) => (
            <li
              key={msg.id}
              title={`Order #${msg.requestId}: ${STATUS[msg.status].label}`}
              className={cn(
                'rounded border px-1.5 py-px font-mono text-[10px] transition-colors duration-300',
                STATUS[msg.status].chip,
              )}
            >
              #{msg.requestId} {STATUS[msg.status].label.toLowerCase()}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">Send a request to queue an order.</p>
      )}
      {waiting?.waitingOn && (
        <p className="text-xs text-degraded">Consumers are waiting for {SERVICE_LABELS[waiting.waitingOn]} to come back.</p>
      )}
    </div>
  )
}
