import { Ban, CheckCircle2, CornerDownRight, Lightbulb, OctagonAlert, ShieldAlert, Wrench, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { clock } from '@/lib/incident/format'
import type { TimelineEntry } from '@/lib/incident/session'
import { Eyebrow } from './shared'

const STYLE: Record<TimelineEntry['kind'], { icon: typeof Zap; className: string }> = {
  event: { icon: Zap, className: 'text-warning' },
  decision: { icon: Wrench, className: 'text-accent' },
  consequence: { icon: CornerDownRight, className: 'text-accent' },
  learned: { icon: Lightbulb, className: 'text-info' },
  rejected: { icon: Ban, className: 'text-fg-subtle' },
  constraint: { icon: ShieldAlert, className: 'text-failed' },
  'slo-breach': { icon: OctagonAlert, className: 'text-failed' },
  'slo-met': { icon: CheckCircle2, className: 'text-healthy' },
}

/**
 * Everything in order, newest first. Decisions and what happened after them
 * sit side by side, so a delayed consequence (a cache warming up, a failover
 * finishing, an event hitting a system you changed) reads as one story.
 */
export function IncidentTimeline({ entries, newestFirst = true }: { entries: TimelineEntry[]; newestFirst?: boolean }) {
  const ordered = newestFirst ? [...entries].reverse() : entries
  return (
    <section aria-labelledby="event-timeline" className="rounded-lg border border-border bg-surface p-3">
      <Eyebrow className="mb-2">
        <span id="event-timeline">Event timeline</span>
      </Eyebrow>
      {ordered.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nothing yet.</p>
      ) : (
        <ol className="max-h-96 space-y-1.5 overflow-y-auto pr-1" aria-label="Timeline">
          {ordered.map((entry, index) => {
            const { icon: Icon, className } = STYLE[entry.kind]
            return (
              <li key={`${entry.time}-${entry.kind}-${index}`} className="flex gap-2 text-[13px]">
                <span className="w-9 shrink-0 font-mono text-[11px] text-fg-subtle">{clock(entry.time)}</span>
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', className)} aria-hidden="true" />
                <span className="min-w-0">
                  <span className={cn('text-fg', entry.kind === 'decision' && 'font-medium')}>{entry.title}</span>
                  {entry.detail && <span className={cn('block text-xs text-fg-muted', entry.kind === 'decision' && 'italic')}>{entry.kind === 'decision' ? `“${entry.detail}”` : entry.detail}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
