import { useState } from 'react'
import { AlertTriangle, Clock, Layers, Lightbulb, Search, Wallet } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { clock, signedUsd, usd } from '@/lib/incident/format'
import type { ActionView, IncidentView } from '@/lib/incident/session'
import { explainDecision, unknownNote } from '@/lib/incident/explain'
import type { Hypothesis, HypothesisStatus } from '@/lib/incident/reasoning'
import { MODES, type ModeConfig } from '@/lib/incident/guidance/modes'
import { OBJECTIVES } from '@/lib/incident/guidance/objectives'
import type { HintAction } from '@/lib/incident/guidance/hints'
import type { StatedHypothesis } from '@/store/incidentStore'
import { ExpectedDirection } from './ActionsPanel'
import { Eyebrow, Modal } from './shared'

interface DecisionDialogProps {
  action: ActionView
  view: IncidentView
  causes: Hypothesis[]
  hypothesis: StatedHypothesis | null
  mode?: ModeConfig
  /** What the operator says they want to improve. Optional. */
  objective?: string | null
  onObjective?: (objective: string | null) => void
  /** Guided mode: this decision targets something nobody has measured yet. */
  nudge?: { text: string; check: HintAction } | null
  /** Switch to another action's preview, e.g. the investigation the nudge suggests. */
  onSwitch?: (actionId: string) => void
  onCancel: () => void
  onConfirm: (rationale: string) => void
}

const EVIDENCE_WORD: Record<HypothesisStatus, string> = {
  likely: 'Evidence suggests',
  active: 'Happening',
  possible: 'Could be',
  unknown: 'You don’t know yet',
  unlikely: 'Evidence points away',
}

/**
 * Last stop before a decision lands. States what it costs and what may go
 * wrong, and asks why: the rationale is stored with the decision in the
 * engine's record and comes back in the postmortem.
 */
export function DecisionDialog({ action, view, causes, hypothesis, mode = MODES.guided, objective = null, onObjective, nudge, onSwitch, onCancel, onConfirm }: DecisionDialogProps) {
  const guides = mode.concepts
  const believed = hypothesis && hypothesis.id !== 'unsure' ? hypothesis : null
  const [rationale, setRationale] = useState(believed ? `I think the cause is ${believed.label.toLowerCase()}, because ` : '')
  const [tried, setTried] = useState(false)
  const missing = rationale.trim() === ''
  const investigate = action.kind === 'investigate'
  const explained = explainDecision(action, view, causes)
  const unknowns = [...new Set(view.unknown.filter((fact) => fact.revealedBy.includes(action.title)).map((fact) => unknownNote(fact.id, view)).filter((note): note is string => note !== null))]
  const cost = view.budget.monthlyCost + action.monthlyCost
  const submit = () => {
    setTried(true)
    if (!missing) onConfirm(rationale)
  }
  return (
    <Modal
      onClose={onCancel}
      title={
        <div className="border-b border-border px-5 pt-4 pb-3">
          <Eyebrow>You are about to · {clock(view.time)}</Eyebrow>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">{action.title}</h2>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {nudge && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5 text-[13px] text-fg" data-testid="investigate-first">
            <p className="flex gap-1.5">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span>{nudge.text}</span>
            </p>
            {onSwitch && (
              <Button size="sm" className="mt-2" onClick={() => onSwitch(nudge.check.actionId)}>
                <Search className="size-3.5 text-info" aria-hidden="true" />
                {nudge.check.title} instead
              </Button>
            )}
          </div>
        )}
        {guides && (
          <div>
            <Eyebrow>{investigate ? 'You are trying to learn' : 'You are trying to'}</Eyebrow>
            <p className="mt-1 text-sm font-medium leading-relaxed text-fg">{explained.goal}</p>
            {believed && <p className="mt-1 text-[12.5px] text-fg-muted">Your hypothesis: {believed.label.toLowerCase()}.</p>}
          </div>
        )}
        {guides && !investigate && explained.improves && explained.improves.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Eyebrow>Expected direction</Eyebrow>
              <div className="mt-1 text-[13px]">
                <ExpectedDirection guide={explained} />
              </div>
            </div>
            <div className="space-y-2 text-[12.5px] leading-snug">
              {explained.helpsWhen?.map((line) => (
                <p key={line}>
                  <span className="font-medium text-healthy">Helps when: </span>
                  <span className="text-fg-muted">{line}</span>
                </p>
              ))}
              {explained.mayNotHelpWhen?.map((line) => (
                <p key={line}>
                  <span className="font-medium text-warning">May not solve: </span>
                  <span className="text-fg-muted">{line}</span>
                </p>
              ))}
            </div>
          </div>
        )}
        {guides && !investigate && explained.evidence.length > 0 && (
          <div data-testid="decision-evidence">
            <Eyebrow>What you can see about it</Eyebrow>
            <ul className="mt-1 space-y-1 text-[12.5px] leading-snug">
              {explained.evidence.map((item) => (
                <li key={item.label}>
                  <span className="font-medium text-fg">{item.label}</span> <span className="font-mono text-[10px] text-fg-subtle uppercase">{EVIDENCE_WORD[item.status]}</span>
                  <span className="block text-fg-muted">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {guides && investigate && unknowns.length > 0 && (
          <div>
            <Eyebrow>Right now</Eyebrow>
            {unknowns.map((note) => (
              <p key={note} className="mt-1 text-[13px] leading-relaxed text-fg-muted">
                {note}
              </p>
            ))}
          </div>
        )}
        <div>
          <Eyebrow>What happens</Eyebrow>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{action.description}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <Fact icon={Clock} label="Takes">
            {action.minutes} min
            <span className="block text-[11px] text-fg-subtle">
              {clock(view.time)} → {clock(Math.min(view.time + action.minutes, view.maxTime))}
            </span>
          </Fact>
          <Fact icon={Wallet} label="Cost">
            {action.monthlyCost === 0 ? 'No change' : `${signedUsd(action.monthlyCost)}/mo`}
            {action.monthlyCost !== 0 && view.budget.limit !== null && (
              <span className={cost > view.budget.limit ? 'block text-[11px] text-failed' : 'block text-[11px] text-fg-subtle'}>
                {usd(cost)} of {usd(view.budget.limit)}
              </span>
            )}
          </Fact>
          <Fact icon={Layers} label="Complexity">
            {action.complexity === 0 ? 'No change' : `${action.complexity > 0 ? '+' : ''}${action.complexity}`}
            {view.complexity.limit !== null && action.complexity !== 0 && (
              <span className="block text-[11px] text-fg-subtle">
                {view.complexity.score + action.complexity} of {view.complexity.limit}
              </span>
            )}
          </Fact>
        </dl>
        {investigate ? (
          <div className="rounded-md border border-info/30 bg-info/5 p-3 text-[13px] text-fg">
            <p className="flex items-center gap-1.5 font-medium">
              <Search className="size-3.5 text-info" aria-hidden="true" />
              Investigating is a decision too
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
              <li>This takes about {action.minutes} minutes.</li>
              <li>The incident continues while you investigate.</li>
              <li>What you learn may change which intervention makes sense.</li>
            </ul>
            {action.reveals.length > 0 && <p className="mt-1.5 text-xs text-fg-subtle">You will learn: {action.reveals.join(', ')}.</p>}
          </div>
        ) : (
          action.risks.length + (guides ? (explained.tradeoffs?.length ?? 0) : 0) > 0 && (
            <div>
              <Eyebrow>Potential risks and trade-offs</Eyebrow>
              <ul className="mt-1 space-y-1">
                {[...action.risks, ...(guides ? (explained.tradeoffs ?? []) : [])].map((risk) => (
                  <li key={risk} className="flex gap-1.5 text-[13px] text-fg">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
        {onObjective && guides && (
          <div>
            <p id="objective" className="text-sm font-medium text-fg">
              What are you trying to improve? <span className="text-xs font-normal text-fg-subtle">Optional</span>
            </p>
            <div role="radiogroup" aria-labelledby="objective" className="mt-1.5 flex flex-wrap gap-1.5">
              {OBJECTIVES.map((option) => {
                const checked = objective === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => onObjective(checked ? null : option.id)}
                    className={cn('rounded-full border px-2.5 py-1 text-[12px] transition-colors', checked ? 'border-accent bg-accent text-white' : 'border-border-strong bg-surface text-fg hover:border-accent')}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div>
          <label htmlFor="rationale" className="text-sm font-medium text-fg">
            Why are you doing this?
          </label>
          <p className="text-xs text-fg-subtle">Required. It is recorded with the decision and shown in the postmortem.</p>
          <textarea
            id="rationale"
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            // A prefilled sentence is meant to be finished, so typing starts at its end.
            onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
            rows={3}
            aria-invalid={tried && missing}
            aria-describedby={tried && missing ? 'rationale-error' : undefined}
            placeholder={investigate ? 'e.g. I need to know if the database is the bottleneck before spending money' : 'e.g. I think the bottleneck is …, because …, so this should …'}
            className="mt-1.5 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
          {tried && missing && (
            <p id="rationale-error" role="alert" className="mt-1 text-xs text-failed">
              Write down your reasoning before you commit.
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} className={missing ? 'opacity-60' : undefined}>
          {investigate ? 'Investigate' : 'Commit decision'}
        </Button>
      </div>
    </Modal>
  )
}

function Fact({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[11px] text-fg-subtle">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[13px] text-fg">{children}</dd>
    </div>
  )
}
