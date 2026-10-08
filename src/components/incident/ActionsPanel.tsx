import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, FastForward, Hourglass } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { signedUsd } from '@/lib/incident/format'
import { decisionGuide, groupActions } from '@/lib/incident/explain'
import type { DecisionGuide } from '@/lib/incident/guide'
import type { YourMove } from '@/lib/incident/reasoning'
import type { ActionView, IncidentView } from '@/lib/incident/session'
import type { StatedHypothesis } from '@/store/incidentStore'
import { Eyebrow } from './shared'

interface ActionsPanelProps {
  view: IncidentView
  move: YourMove | null
  /** What the operator can say they believe; empty hides the prompt. */
  hypotheses: StatedHypothesis[]
  hypothesis: StatedHypothesis | null
  onHypothesis: (hypothesis: StatedHypothesis | null) => void
  /** Early on, every action shows what it is for; later that sits behind a toggle. */
  explain: boolean
  onSelect: (id: string) => void
  onWait: (minutes: number) => void
  onFinish: () => void
}

/** The decision cue, then the actions grouped by what they try to accomplish. */
export function ActionsPanel({ view, move, hypotheses, hypothesis, onHypothesis, explain, onSelect, onWait, onFinish }: ActionsPanelProps) {
  return (
    <section aria-labelledby="available-actions" className="rounded-lg border border-border bg-surface">
      {move && (
        <div className="rounded-t-lg border-b border-accent/40 bg-accent-soft px-4 py-3" data-testid="your-move">
          <Eyebrow className="text-accent">Your move</Eyebrow>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg">{move.framing}</p>
          <p className="mt-1 text-[14px] font-semibold text-fg">{move.question}</p>
          {hypotheses.length > 0 && (
            <div className="mt-2.5">
              <p id="your-hypothesis" className="text-[12px] text-fg-muted">
                What do you think is causing it? <span className="text-fg-subtle">Optional, and it doesn’t limit what you can do.</span>
              </p>
              <div role="radiogroup" aria-labelledby="your-hypothesis" className="mt-1.5 flex flex-wrap gap-1.5">
                {hypotheses.map((option) => {
                  const checked = hypothesis?.id === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => onHypothesis(checked ? null : option)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                        checked ? 'border-accent bg-accent text-white' : 'border-border-strong bg-surface text-fg hover:border-accent',
                      )}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="p-3">
        <Eyebrow className="mb-2">
          <span id="available-actions">Available actions</span>
        </Eyebrow>
        {groupActions(view.actions, view.scenarioId).map(({ group, actions }) => (
          <div key={group.id} className="mt-3 first-of-type:mt-0" role="group" aria-label={group.title}>
            <p className="mb-1.5 text-xs">
              <span className="font-semibold text-fg">{group.title}</span> <span className="text-fg-subtle">{group.note}</span>
            </p>
            <div className="space-y-1.5">
              {actions.map((action) => (
                <ActionButton key={action.id} action={action} guide={decisionGuide(action, view.scenarioId)} explain={explain} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
        <div className="mt-3" role="group" aria-label="Hold">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs">
            <Hourglass className="size-3.5 text-fg-subtle" aria-hidden="true" />
            <span className="font-semibold text-fg">Hold</span> <span className="text-fg-subtle">Watch what the system does on its own.</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onWait(1)}>
              Wait 1 min
            </Button>
            <Button size="sm" onClick={() => onWait(5)}>
              Wait 5 min
            </Button>
            <Button size="sm" variant="ghost" onClick={onFinish} title="No more decisions: let the incident play out">
              <FastForward className="size-3.5" aria-hidden="true" />
              Play out to the end
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function ActionButton({ action, guide, explain, onSelect }: { action: ActionView; guide: DecisionGuide; explain: boolean; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const details = (guide.helpsWhen?.length ?? 0) > 0 || (guide.mayNotHelpWhen?.length ?? 0) > 0 || (guide.tradeoffs?.length ?? 0) > 0 || (guide.improves?.length ?? 0) > 0
  return (
    <div className={cn('rounded-md border', action.enabled ? 'border-border bg-surface-2' : 'border-dashed border-border opacity-70')}>
      <button
        type="button"
        disabled={!action.enabled}
        onClick={() => onSelect(action.id)}
        className={cn('w-full rounded-md px-2.5 py-2 text-left transition-colors', action.enabled ? 'hover:bg-surface-3' : 'cursor-not-allowed')}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-fg">{action.title}</span>
          <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
            {action.minutes} min
            {action.monthlyCost !== 0 && <> · {signedUsd(action.monthlyCost)}/mo</>}
            {action.complexity !== 0 && <> · {action.complexity > 0 ? '+' : ''}{action.complexity} cx</>}
          </span>
        </span>
        {(explain || action.kind === 'investigate') && <span className="mt-0.5 block text-[12px] leading-snug text-fg-muted">{guide.goal}</span>}
        {!action.enabled && action.reason && <span className="mt-0.5 block text-xs text-warning">Unavailable: {action.reason}</span>}
        {action.timesTaken > 0 && action.enabled && <span className="mt-0.5 block text-[11px] text-fg-subtle">Done {action.timesTaken}× already</span>}
      </button>
      {details && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center gap-1 border-t border-border/60 px-2.5 py-1 text-left text-[11px] text-fg-subtle hover:text-fg"
          >
            <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            {explain ? 'When it helps, what it changes, the trade-offs' : `What it’s for · ${lowerFirst(guide.goal.replace(/\.$/, ''))}`}
          </button>
          {open && <GuideDetails guide={guide} />}
        </>
      )}
    </div>
  )
}

/** When it helps, when it may not, what it may change and what it costs. Shared with the decision dialog. */
export function GuideDetails({ guide, className }: { guide: DecisionGuide; className?: string }) {
  return (
    <dl className={cn('space-y-1.5 px-2.5 pb-2 text-[12px] leading-snug', className)}>
      {guide.helpsWhen && guide.helpsWhen.length > 0 && (
        <div>
          <dt className="font-medium text-healthy">When might this help?</dt>
          {guide.helpsWhen.map((line) => (
            <dd key={line} className="text-fg-muted">
              {line}
            </dd>
          ))}
        </div>
      )}
      {guide.improves && guide.improves.length > 0 && (
        <div>
          <dt className="font-medium text-fg">What might it change?</dt>
          <dd>
            <ExpectedDirection guide={guide} />
          </dd>
        </div>
      )}
      {guide.mayNotHelpWhen && guide.mayNotHelpWhen.length > 0 && (
        <div>
          <dt className="font-medium text-warning">What might it not solve?</dt>
          {guide.mayNotHelpWhen.map((line) => (
            <dd key={line} className="text-fg-muted">
              {line}
            </dd>
          ))}
        </div>
      )}
      {guide.tradeoffs && guide.tradeoffs.length > 0 && (
        <div>
          <dt className="font-medium text-fg">Trade-offs</dt>
          <dd className="text-fg-muted">{guide.tradeoffs.join(' · ')}</dd>
        </div>
      )}
    </dl>
  )
}

export function ExpectedDirection({ guide }: { guide: DecisionGuide }) {
  return (
    <ul className="space-y-0.5">
      {(guide.improves ?? []).map((change) => (
        <li key={change.label} className="flex items-center gap-1 text-fg-muted">
          {change.direction === 'down' ? <ArrowDown className="size-3 shrink-0 text-fg" aria-label="down" /> : <ArrowUp className="size-3 shrink-0 text-fg" aria-label="up" />}
          <span>
            {change.label}
            {change.when && <span className="text-fg-subtle"> ({change.when})</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
