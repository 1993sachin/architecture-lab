import { m } from 'framer-motion'
import { ArrowRight, CornerDownRight, Lightbulb, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { clock, metricValue } from '@/lib/incident/format'
import { explainTransition, type HypothesisStatus } from '@/lib/incident/reasoning'
import type { MetricDelta, Transition } from '@/lib/incident/session'
import { Eyebrow } from './shared'

const STATUS_WORD: Record<HypothesisStatus, string> = {
  likely: 'evidence suggests',
  active: 'happening',
  possible: 'could be',
  unknown: 'unknown',
  unlikely: 'evidence points away',
}

/**
 * The consequence of the last move: what you did, how far the clock moved,
 * what got better, what got worse, and why, in terms of what you can see.
 * Bad news is told as plainly as good news.
 */
export function TransitionCard({ transition, onPostmortem }: { transition: Transition; onPostmortem?: () => void }) {
  const { decision } = transition
  const explained = explainTransition(transition)
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
  const eyebrow = decision ? (decision.kind === 'investigate' ? 'Investigation complete' : 'Decision applied') : transition.start ? 'Paged' : 'Time passed'
  const other = transition.deltas.filter((delta) => delta.key === 'traffic' || delta.key === 'cost')
  const worse = explained.worsened.length > 0 && explained.improved.length === 0
  return (
    <m.section
      key={`${transition.from}-${transition.to}-${decision?.id ?? 'wait'}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      aria-live="polite"
      aria-label="What just happened"
      data-testid="transition"
      className={cn('rounded-lg border bg-surface p-4', worse ? 'border-failed/40' : explained.improved.length > 0 ? 'border-healthy/40' : 'border-border-strong')}
    >
      <Eyebrow className={worse ? 'text-failed' : 'text-accent'}>{eyebrow}</Eyebrow>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-fg">{headline}</p>
        <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-fg" data-testid="transition-clock">
          {clock(transition.from)}
          <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden="true" />
          {clock(transition.to)}
        </span>
        {minutes > 0 && <span className="text-xs text-fg-subtle">{minutes} min passed</span>}
        {transition.requested !== undefined && minutes < transition.requested && !transition.complete && (
          <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">Stopped early: something happened</span>
        )}
      </div>
      {decision && <p className="mt-0.5 text-xs text-fg-muted italic">“{decision.rationale}”</p>}

      {transition.revealed.length > 0 && (
        <div className="mt-3 rounded-md border border-info/40 bg-info/5 p-2.5" data-testid="new-information">
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
        <ul className="mt-3 space-y-1">
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

      {(explained.improved.length > 0 || explained.worsened.length > 0 || other.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Changes" role="group">
          {explained.improved.length > 0 && <DeltaList title="Improved" icon={TrendingUp} tone="text-healthy" deltas={explained.improved} />}
          {explained.worsened.length > 0 && <DeltaList title="Got worse" icon={TrendingDown} tone="text-failed" deltas={explained.worsened} />}
          {other.length > 0 && <DeltaList title="Also changed" deltas={other} />}
        </div>
      )}
      {transition.deltas.length === 0 && minutes > 0 && <p className="mt-2 text-xs text-fg-muted">No visible metric moved noticeably.</p>}

      {(explained.why.length > 0 || explained.meanwhile.length > 0) && (
        <div className="mt-3 border-t border-border pt-3" data-testid="why-this-happened">
          <Eyebrow>{explained.why.length > 0 ? 'Why this happened' : 'Meanwhile'}</Eyebrow>
          <ul className="mt-1 space-y-1 text-[13px] leading-relaxed">
            {explained.why.map((line) => (
              <li key={line} className="flex gap-1.5 text-fg">
                <CornerDownRight className="mt-1 size-3 shrink-0 text-accent" aria-hidden="true" />
                {line}
              </li>
            ))}
            {explained.meanwhile.map((line) => (
              <li key={line} className="pl-4.5 text-fg-muted">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {explained.changes.length > 0 && (
        <div className="mt-3 border-t border-border pt-3" data-testid="picture-changed">
          <Eyebrow>How the picture changed</Eyebrow>
          <ul className="mt-1 space-y-1 text-[13px]">
            {explained.changes.map((change) => (
              <li key={change.id}>
                <span className="font-medium text-fg">{change.label}:</span>{' '}
                <span className="font-mono text-xs text-fg-subtle">
                  {change.from === change.to ? `still ${STATUS_WORD[change.to]}, new evidence` : `${change.from ? `${STATUS_WORD[change.from]} → ` : ''}${STATUS_WORD[change.to]}`}
                </span>
                <span className="block text-xs text-fg-muted">{change.evidence}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {transition.complete && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
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

function DeltaList({ title, icon: Icon, tone, deltas }: { title: string; icon?: typeof TrendingUp; tone?: string; deltas: MetricDelta[] }) {
  return (
    <div>
      <p className={cn('flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase', tone ?? 'text-fg-subtle')}>
        {Icon && <Icon className="size-3.5" aria-hidden="true" />}
        {title}
      </p>
      <ul className="mt-1 space-y-0.5" aria-label={title}>
        {deltas.map((delta) => (
          <li key={delta.key} className="flex items-center gap-1.5 font-mono text-[13px]">
            <span className="w-28 shrink-0 truncate font-sans text-xs text-fg-muted">{delta.label}</span>
            <span className="text-fg-muted">{delta.before === null ? 'unknown' : metricValue(delta.unit, delta.before)}</span>
            <ArrowRight className="size-3 text-fg-subtle" aria-hidden="true" />
            <span className={cn('font-semibold', delta.better === null || title === 'Also changed' ? 'text-fg' : delta.better ? 'text-healthy' : 'text-failed')}>
              {delta.after === null ? 'unknown' : metricValue(delta.unit, delta.after)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
