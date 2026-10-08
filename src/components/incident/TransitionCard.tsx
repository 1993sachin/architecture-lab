import { m } from 'framer-motion'
import { AlertTriangle, ArrowRight, Brain, ChevronRight, CornerDownRight, Lightbulb, Target, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { clock, metricValue } from '@/lib/incident/format'
import { interpretFact } from '@/lib/incident/explain'
import { explainConsequence, type HypothesisStatus } from '@/lib/incident/reasoning'
import type { MetricDelta, Transition } from '@/lib/incident/session'
import type { Clue } from '@/lib/incident/guidance/clues'
import type { ObjectiveResult } from '@/lib/incident/guidance/objectives'
import type { StatedHypothesis } from '@/store/incidentStore'
import { Eyebrow } from './shared'

const STATUS_WORD: Record<HypothesisStatus, string> = {
  likely: 'evidence suggests',
  active: 'happening',
  possible: 'could be',
  unknown: 'unknown',
  unlikely: 'evidence points away',
}

/**
 * The consequence of the last move, compact: what you did and why, what
 * changed, why it changed, and what to watch now. The full detail (every
 * delta, how the picture of causes moved) is one click away.
 */
interface TransitionCardProps {
  transition: Transition
  hypothesis?: StatedHypothesis | null
  /** "Why?" lines, risks and the hypothesis check. Expert mode shows only what changed. */
  why?: boolean
  /** How the move did against what the operator said they wanted. */
  objective?: ObjectiveResult | null
  /** After a move that didn't go as hoped: what it reveals, as a question. */
  clue?: Clue | null
  onPostmortem?: () => void
}

const OBJECTIVE_TONE: Record<ObjectiveResult['verdict'], string> = { better: 'text-healthy', worse: 'text-failed', unclear: 'text-fg-muted' }
const OBJECTIVE_WORD: Record<ObjectiveResult['verdict'], string> = { better: 'moved the way you wanted', worse: 'moved the other way', unclear: 'no clear change' }

export function TransitionCard({ transition, hypothesis, why = true, objective, clue, onPostmortem }: TransitionCardProps) {
  const { decision } = transition
  const full = explainConsequence(transition, hypothesis)
  const explained = why ? full : { ...full, why: [], meanwhile: [], newRisk: undefined, hypothesis: undefined, changes: [] }
  const minutes = transition.to - transition.from
  const investigation = decision?.kind === 'investigate'
  const headline = decision
    ? investigation
      ? `You investigated: ${decision.title.replace(/^Investigate /, '')}.`
      : `You chose: ${decision.title}.`
    : transition.start
      ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} into your shift, you got paged.`
      : transition.to === transition.from
        ? 'Nothing happened.'
        : 'You held and watched.'
  const eyebrow = decision ? (investigation ? 'Investigation complete' : 'What happened') : transition.start ? 'Paged' : 'Time passed'
  const traffic = transition.deltas.find((delta) => delta.key === 'traffic')
  const cost = transition.deltas.find((delta) => delta.key === 'cost')
  const worse = explained.worsened.length > 0 && explained.improved.length === 0
  const [firstWhy, ...moreWhy] = explained.why
  const shownWhy = [firstWhy, moreWhy[0]].filter((line): line is string => line !== undefined)
  const restWhy = moreWhy.slice(1)
  const hidden = explained.headline.length < explained.improved.length + explained.worsened.length
  const picture = explained.changes.length > 0
  const more = hidden || restWhy.length > 0 || (picture && !investigation) || explained.meanwhile.length > 1
  return (
    <m.section
      key={`${transition.from}-${transition.to}-${decision?.id ?? 'wait'}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      aria-live="polite"
      aria-label="What just happened"
      data-testid="transition"
      className={cn('rounded-lg border bg-surface p-3.5', worse ? 'border-failed/40' : explained.improved.length > 0 ? 'border-healthy/40' : 'border-border-strong')}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Eyebrow className={worse ? 'text-failed' : 'text-accent'}>{eyebrow}</Eyebrow>
        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-fg" data-testid="transition-clock">
          {clock(transition.from)}
          <ArrowRight className="size-3 text-fg-subtle" aria-hidden="true" />
          {clock(transition.to)}
        </span>
        {minutes > 0 && <span className="text-[11px] text-fg-subtle">{minutes} min passed</span>}
        {transition.requested !== undefined && minutes < transition.requested && !transition.complete && (
          <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">Stopped early: something happened</span>
        )}
      </div>
      <p className="mt-1 text-sm font-semibold text-fg">{headline}</p>
      {explained.goal && (
        <p className="mt-0.5 flex gap-1.5 text-[13px] text-fg-muted" data-testid="trying-to">
          <Target className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <span className="text-fg">You were trying to:</span> {lowerFirst(explained.goal)}
          </span>
        </p>
      )}
      {decision && <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle italic">“{decision.rationale}”</p>}
      {objective && (
        <p className="mt-1 text-[12.5px]" data-testid="objective-result">
          <span className="text-fg">You wanted to: {lowerFirst(objective.label)}.</span>{' '}
          <span className={cn('font-medium', OBJECTIVE_TONE[objective.verdict])}>{OBJECTIVE_WORD[objective.verdict]}:</span> <span className="text-fg-muted">{objective.text}</span>
        </p>
      )}

      {transition.revealed.length > 0 && (
        <div className="mt-2.5 rounded-md border border-info/40 bg-info/5 p-2.5" data-testid="new-information">
          <Eyebrow className="flex items-center gap-1 text-info">
            <Lightbulb className="size-3" aria-hidden="true" />
            New information · previously unavailable
          </Eyebrow>
          <ul className="mt-1 space-y-1">
            {transition.revealed.map((value) => (
              <li key={value.id} className="text-[13px]">
                <span className="font-medium text-fg">{value.text}</span>
                <span className="block text-xs text-fg-muted">{interpretFact(value, transition.after) ?? value.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {transition.events.length > 0 && (
        <ul className="mt-2.5 space-y-1">
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

      {(explained.headline.length > 0 || traffic || cost) && (
        <div className="mt-2.5" role="group" aria-label="Changes">
          <Eyebrow>What changed</Eyebrow>
          <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2" aria-label="What changed">
            {explained.headline.map((delta) => (
              <DeltaRow key={delta.key} delta={delta} />
            ))}
            {traffic && <DeltaRow delta={traffic} neutral />}
            {cost && <DeltaRow delta={cost} neutral />}
          </ul>
        </div>
      )}
      {transition.deltas.length === 0 && minutes > 0 && <p className="mt-2 text-xs text-fg-muted">No visible metric moved noticeably.</p>}

      {(shownWhy.length > 0 || explained.meanwhile.length > 0) && (
        <div className="mt-2.5" data-testid="why-this-happened">
          <Eyebrow>{shownWhy.length > 0 ? 'Why?' : 'Meanwhile'}</Eyebrow>
          <ul className="mt-0.5 space-y-0.5 text-[13px] leading-relaxed">
            {shownWhy.map((line) => (
              <li key={line} className="flex gap-1.5 text-fg">
                <CornerDownRight className="mt-1 size-3 shrink-0 text-accent" aria-hidden="true" />
                {line}
              </li>
            ))}
            {explained.meanwhile.slice(0, 1).map((line) => (
              <li key={line} className="pl-4.5 text-fg-muted">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {clue && (
        <div className="mt-2.5 rounded-md border border-accent/40 bg-accent-soft p-2.5 text-[13px]" data-testid="new-clue">
          <Eyebrow className="flex items-center gap-1 text-accent">
            <Brain className="size-3" aria-hidden="true" />
            New clue
          </Eyebrow>
          <p className="mt-0.5 text-fg">{clue.text}</p>
          <p className="mt-0.5 font-semibold text-fg">{clue.question}</p>
        </div>
      )}

      {explained.newRisk && (
        <p className="mt-2 flex gap-1.5 text-[13px] text-fg" data-testid="new-risk">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-medium">New risk:</span> <span className="text-fg-muted">{explained.newRisk}</span>
          </span>
        </p>
      )}

      {explained.hypothesis && (
        <p className="mt-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] leading-snug" data-testid="hypothesis-check">
          <span className="text-fg">You thought: {explained.hypothesis.label.toLowerCase()}.</span>{' '}
          <span className="font-mono text-[10px] text-fg-subtle uppercase">Now: {STATUS_WORD[explained.hypothesis.status]}</span>
          {!(investigation && explained.changes.some((change) => change.evidence === explained.hypothesis?.evidence)) && <span className="block text-fg-muted">{explained.hypothesis.evidence}</span>}
        </p>
      )}

      {picture && investigation && <PictureChanged changes={explained.changes} />}

      {more && (
        <details className="group mt-2.5 border-t border-border pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
            Everything that changed
          </summary>
          <div className="mt-2 space-y-3">
            {hidden && (
              <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2" aria-label="All changes">
                {[...explained.improved, ...explained.worsened].map((delta) => (
                  <DeltaRow key={delta.key} delta={delta} />
                ))}
              </ul>
            )}
            {(restWhy.length > 0 || explained.meanwhile.length > 1) && (
              <ul className="space-y-0.5 text-[13px] leading-relaxed">
                {restWhy.map((line) => (
                  <li key={line} className="flex gap-1.5 text-fg">
                    <CornerDownRight className="mt-1 size-3 shrink-0 text-accent" aria-hidden="true" />
                    {line}
                  </li>
                ))}
                {explained.meanwhile.slice(1).map((line) => (
                  <li key={line} className="pl-4.5 text-fg-muted">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {picture && !investigation && <PictureChanged changes={explained.changes} />}
          </div>
        </details>
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

function PictureChanged({ changes }: { changes: ReturnType<typeof explainConsequence>['changes'] }) {
  return (
    <div className="mt-2.5" data-testid="picture-changed">
      <Eyebrow>How the picture changed</Eyebrow>
      <ul className="mt-0.5 space-y-1 text-[13px]">
        {changes.map((change) => (
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
  )
}

function DeltaRow({ delta, neutral }: { delta: MetricDelta; neutral?: boolean }) {
  const tone = neutral || delta.better === null ? 'text-fg' : delta.better ? 'text-healthy' : 'text-failed'
  return (
    <li className="flex items-center gap-1.5 font-mono text-[13px]">
      <span className={cn('w-28 shrink-0 truncate font-sans text-xs', neutral ? 'text-fg-subtle' : 'text-fg-muted')}>{delta.label}</span>
      <span className="text-fg-muted">{delta.before === null ? 'unknown' : metricValue(delta.unit, delta.before)}</span>
      <ArrowRight className="size-3 text-fg-subtle" aria-hidden="true" />
      <span className={cn('font-semibold', tone)}>{delta.after === null ? 'unknown' : metricValue(delta.unit, delta.after)}</span>
      {!neutral && delta.better !== null && <span className="sr-only">{delta.better ? '(better)' : '(worse)'}</span>}
    </li>
  )
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text
}
