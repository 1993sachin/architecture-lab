import { m } from 'framer-motion'
import { ArrowRight, CornerDownRight, Lightbulb, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { clock, metricValue } from '@/lib/incident/format'
import type { MetricDelta, Transition } from '@/lib/incident/session'
import { Eyebrow } from './shared'

/**
 * The heart of the runner: what you did, how far the clock moved, and what
 * changed while it did. Shown after every move.
 */
export function TransitionCard({ transition, onPostmortem }: { transition: Transition; onPostmortem?: () => void }) {
  const { decision } = transition
  const minutes = transition.to - transition.from
  const headline = decision
    ? decision.kind === 'investigate'
      ? `You investigated: ${decision.title.replace(/^Investigate /, '')}.`
      : `You chose: ${decision.title}.`
    : transition.start
      ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} into your shift, you got paged.`
      : transition.to === transition.from
        ? 'Nothing happened.'
        : 'You held and watched.'
  return (
    <m.section
      key={`${transition.from}-${transition.to}-${decision?.id ?? 'wait'}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      aria-live="polite"
      aria-label="What just happened"
      data-testid="transition"
      className="rounded-lg border border-accent/40 bg-accent-soft p-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-fg">{headline}</p>
        <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-fg" data-testid="transition-clock">
          {clock(transition.from)}
          <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden="true" />
          {clock(transition.to)}
        </span>
        {transition.to > transition.from && <span className="text-xs text-fg-subtle">{transition.to - transition.from} min passed</span>}
        {transition.requested !== undefined && transition.to - transition.from < transition.requested && !transition.complete && (
          <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">Stopped early: something happened</span>
        )}
      </div>
      {decision && <p className="mt-0.5 text-xs text-fg-muted italic">“{decision.rationale}”</p>}
      {transition.revealed.length > 0 && (
        <div className="mt-2 rounded-md border border-info/40 bg-info/5 p-2.5" data-testid="new-information">
          <Eyebrow className="flex items-center gap-1 text-info">
            <Lightbulb className="size-3" aria-hidden="true" />
            New information · previously unavailable
          </Eyebrow>
          <ul className="mt-1 space-y-1">
            {transition.revealed.map((value) => (
              <li key={value.id} className="text-[13px]">
                <span className="font-medium text-fg">{value.text}</span>
                {value.description && <span className="block text-xs text-fg-muted">{value.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {transition.events.length > 0 && (
        <ul className="mt-2 space-y-1">
          {transition.events.map((event) => (
            <li key={event.eventId} className="flex gap-1.5 text-[13px]">
              <Zap className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span>
                <span className="font-mono text-xs text-fg-subtle">{clock(event.time)}</span> <span className="font-medium text-fg">{event.title}.</span>{' '}
                <span className="text-fg-muted">{event.description}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {transition.delayed.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Delayed effects">
          {transition.delayed.map((entry, index) => (
            <li key={`${entry.time}-${index}`} className="flex gap-1.5 text-[13px]">
              <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <span className="font-mono text-xs text-fg-subtle">{clock(entry.time)}</span> <span className="text-fg">{entry.title}</span> <span className="text-xs text-fg-subtle">{entry.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {transition.deltas.length > 0 ? (
        <ul className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-2" aria-label="Changes">
          {transition.deltas.map((delta) => (
            <DeltaRow key={delta.key} delta={delta} />
          ))}
        </ul>
      ) : (
        transition.to > transition.from && <p className="mt-2 text-xs text-fg-muted">No visible metric moved noticeably.</p>
      )}
      {transition.complete && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-accent/30 pt-3">
          <p className="text-sm text-fg">The incident window has closed at {clock(transition.to)}.</p>
          {onPostmortem && (
            <Button variant="primary" size="sm" onClick={onPostmortem}>
              Read the postmortem
            </Button>
          )}
        </div>
      )}
    </m.section>
  )
}

function DeltaRow({ delta }: { delta: MetricDelta }) {
  return (
    <li className="flex items-center gap-1.5 font-mono text-[13px]">
      <span className="w-28 shrink-0 truncate font-sans text-xs text-fg-muted">{delta.label}</span>
      <span className="text-fg-muted">{delta.before === null ? 'unknown' : metricValue(delta.unit, delta.before)}</span>
      <ArrowRight className="size-3 text-fg-subtle" aria-hidden="true" />
      <span className={cn('font-semibold', delta.better === null ? 'text-fg' : delta.better ? 'text-healthy' : 'text-failed')}>
        {delta.after === null ? 'unknown' : metricValue(delta.unit, delta.after)}
      </span>
    </li>
  )
}
