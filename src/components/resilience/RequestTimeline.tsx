import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatSimTime, type EventTone, type TimelineEvent } from '@/lib/simulation/resilience'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

const toneText: Record<EventTone, string> = {
  neutral: 'text-fg-muted',
  success: 'text-healthy',
  failed: 'text-failed',
  warning: 'text-degraded',
  info: 'text-info',
}
const toneDot: Record<EventTone, string> = {
  neutral: 'bg-fg-subtle/60',
  success: 'bg-healthy',
  failed: 'bg-failed',
  warning: 'bg-degraded',
  info: 'bg-info',
}

/** Recent simulated events, newest first, timestamped with the simulated clock. */
export function RequestTimeline({
  events,
  onClear,
  className,
}: {
  events: TimelineEvent[]
  onClear: () => void
  className?: string
}) {
  return (
    <Card className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-fg">Request Timeline</h2>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear} disabled={events.length === 0}>
          <Trash2 className="size-3.5" aria-hidden="true" /> Clear
        </Button>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-fg-subtle">No events yet. Send a request or break something.</p>
      ) : (
        <ol
          className="max-h-[340px] flex-1 overflow-y-auto px-4 py-2 font-mono text-[11.5px]"
          aria-label="Recent events, newest first"
        >
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 py-[3px]">
              <time className="shrink-0 text-fg-subtle tabular-nums">{formatSimTime(e.t)}</time>
              <span className={cn('mt-[5px] size-1.5 shrink-0 rounded-full', toneDot[e.tone])} aria-hidden="true" />
              <span className={cn('min-w-0', toneText[e.tone])}>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
