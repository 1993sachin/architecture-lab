import { useState } from 'react'
import { ArrowRight, Lightbulb, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import type { GuidanceContext } from '@/lib/incident/guidance/context'
import { evidence, missing, MISSING, symptoms, type MissingId, type SymptomId } from '@/lib/incident/guidance/flow'
import { guidance, type Guidance, type HintAction } from '@/lib/incident/guidance/hints'
import { situationKey } from '@/lib/incident/guidance/situation'
import type { Struggle } from '@/lib/incident/guidance/struggle'
import type { HintState } from '@/store/incidentStore'
import { Eyebrow } from './shared'

interface GuidancePanelProps {
  context: GuidanceContext
  hint: HintState | null
  /** Shown when the operator seems stuck and hasn't dismissed it. */
  struggle: Struggle | null
  onHint: (stuck?: boolean) => void
  onCloseHint: () => void
  onRevisit: () => void
  /** Takes the operator to the actions, to decide for themselves. */
  onDecide: () => void
  onDismissPrompt: () => void
  onReasoningFlow: () => void
  /** Opens the usual decision preview. Guidance never decides on its own. */
  onSelect: (actionId: string) => void
}

const NEXT_RUNG = { 2: 'Stronger hint', 3: 'Walk me through it' } as const

/**
 * Help on request, in the operator's own decision panel: a hint ladder and a
 * short "help me reason" walk. Nothing here acts; every option opens the same
 * preview as clicking the action yourself.
 */
export function GuidancePanel({ context, hint, struggle, onHint, onCloseHint, onRevisit, onDecide, onDismissPrompt, onReasoningFlow, onSelect }: GuidancePanelProps) {
  const [flow, setFlow] = useState(false)
  const stale = hint !== null && hint.key !== situationKey(context)
  const shown = hint && !stale ? guidance(context, hint.level) : null

  return (
    <div className="space-y-2 border-b border-border px-4 py-3" data-testid="guidance">
      {struggle?.prompt && !hint && !flow && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-2 text-[13px]" data-testid="struggle-prompt">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-fg">
            {struggle.prompt}{' '}
            <button type="button" onClick={() => onHint()} className="font-medium text-accent hover:underline">
              Give me a hint
            </button>
          </span>
          <button type="button" aria-label="Not now" onClick={onDismissPrompt} className="-m-2 grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:text-fg sm:-m-1.5 sm:size-7">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {shown && hint?.exhausted ? (
        <NextSteps
          investigation={shown.actions.find((action) => action.kind === 'investigate') ?? openInvestigation(context)}
          onInvestigate={onSelect}
          onDecide={() => {
            onCloseHint()
            onDecide()
          }}
          onRevisit={onRevisit}
          onClose={onCloseHint}
        />
      ) : shown ? (
        <HintCard hint={shown} onNext={() => onHint()} onClose={onCloseHint} onSelect={onSelect} />
      ) : stale ? (
        <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-fg-muted">
          The situation has changed since that hint.{' '}
          <button type="button" onClick={() => onHint()} className="font-medium text-accent hover:underline">
            Ask again
          </button>{' '}
          or{' '}
          <button type="button" onClick={onCloseHint} className="font-medium text-accent hover:underline">
            close it
          </button>
          .
        </div>
      ) : flow ? (
        <ReasoningFlow context={context} onClose={() => setFlow(false)} onHint={() => (setFlow(false), onHint())} onSelect={onSelect} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Button
            size="sm"
            onClick={() => {
              setFlow(true)
              onReasoningFlow()
            }}
          >
            <Lightbulb className="size-3.5 text-warning" aria-hidden="true" />
            Help me reason
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onHint()}>
            Give me a hint
          </Button>
          <button type="button" onClick={() => onHint(true)} className="min-h-9 px-1 text-[12px] text-fg-subtle hover:text-fg sm:min-h-0">
            I’m stuck
          </button>
        </div>
      )}
    </div>
  )
}

function openInvestigation({ view }: GuidanceContext): HintAction | null {
  const action = view.actions.find((candidate) => candidate.kind === 'investigate' && candidate.enabled && candidate.timesTaken === 0)
  return action ? { actionId: action.id, title: action.title, kind: action.kind } : null
}

/** After guided reasoning: no new rung, just the ways forward. */
function NextSteps({ investigation, onInvestigate, onDecide, onRevisit, onClose }: { investigation: HintAction | null; onInvestigate: (actionId: string) => void; onDecide: () => void; onRevisit: () => void; onClose: () => void }) {
  return (
    <section aria-label="What next" className="rounded-md border border-warning/40 bg-warning/5 p-2.5" data-testid="hint-exhausted">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-snug text-fg">You’ve seen the available evidence for this situation. What would you like to do?</p>
        <button type="button" aria-label="Close hint" onClick={onClose} className="-m-2 grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:text-fg sm:-m-1.5 sm:size-7">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {investigation && (
          <Button size="sm" onClick={() => onInvestigate(investigation.actionId)}>
            <Search className="size-3.5 text-info" aria-hidden="true" />
            {investigation.title}
          </Button>
        )}
        <Button size="sm" onClick={onDecide}>
          Make a decision
        </Button>
        <Button size="sm" variant="ghost" onClick={onRevisit}>
          Revisit the evidence
        </Button>
      </div>
      <p className="mt-1.5 text-[11.5px] text-fg-subtle">New hints start again once the situation changes.</p>
    </section>
  )
}

function HintCard({ hint, onNext, onClose, onSelect }: { hint: Guidance; onNext: () => void; onClose: () => void; onSelect: (actionId: string) => void }) {
  const rescue = hint.level === 4
  return (
    <section aria-label={hint.title} className="rounded-md border border-warning/40 bg-warning/5 p-2.5" data-testid="hint">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow className="flex items-center gap-1 text-warning">
          <Lightbulb className="size-3" aria-hidden="true" />
          {hint.title}
          <span className="ml-1 flex gap-0.5" aria-hidden="true">
            {[2, 3, 4].map((level) => (
              <span key={level} className={cn('size-1.5 rounded-full', level <= hint.level ? 'bg-warning' : 'bg-border-strong')} />
            ))}
          </span>
        </Eyebrow>
        <button type="button" aria-label="Close hint" onClick={onClose} className="-m-2 grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:text-fg sm:-m-1.5 sm:size-7">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {rescue && <p className="mt-1 text-[12.5px] text-fg-muted">Let’s reason through this together. Here is what we can see:</p>}
      {rescue ? (
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[13px] leading-snug text-fg">
          {hint.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      ) : (
        hint.lines.map((line) => (
          <p key={line} className="mt-1 text-[13px] leading-snug text-fg">
            {line}
          </p>
        ))
      )}
      {hint.conclusion && <p className="mt-1.5 text-[13px] leading-snug text-fg">{hint.conclusion}</p>}
      {hint.question && <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-fg">{hint.question}</p>}
      {hint.actions.length > 0 && (
        <ul className="mt-2 space-y-1.5" aria-label={rescue ? 'Options that fit the evidence' : 'Next step'}>
          {hint.actions.map((action) => (
            <OptionButton key={action.actionId} action={action} detailed={rescue && hint.actions.length > 1} onSelect={onSelect} />
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hint.level < 4 && (
          <Button size="sm" variant="ghost" onClick={onNext}>
            {NEXT_RUNG[hint.level as 2 | 3]}
          </Button>
        )}
        {rescue && <p className="text-[11.5px] text-fg-subtle">You decide. Each option opens the usual preview first.</p>}
      </div>
    </section>
  )
}

function OptionButton({ action, detailed, onSelect }: { action: HintAction; detailed: boolean; onSelect: (actionId: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onSelect(action.actionId)} className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-left hover:border-accent">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
          {action.kind === 'investigate' ? <Search className="size-3.5 text-info" aria-hidden="true" /> : <ArrowRight className="size-3.5 text-accent" aria-hidden="true" />}
          {action.title}
        </span>
        {detailed && action.why && <span className="mt-0.5 block text-[12px] leading-snug text-fg-muted">{action.why}</span>}
        {detailed && action.tradeoff && <span className="block text-[11.5px] text-fg-subtle">Trade-off: {action.tradeoff}</span>}
      </button>
    </li>
  )
}

/** "Help me reason": what is hurting, what we know, what we're missing, then a next step. */
function ReasoningFlow({ context, onClose, onHint, onSelect }: { context: GuidanceContext; onClose: () => void; onHint: () => void; onSelect: (actionId: string) => void }) {
  const { view } = context
  const [symptom, setSymptom] = useState<SymptomId | null>(null)
  const [gap, setGap] = useState<MissingId | null>(null)
  const hurting = symptoms(view)
  const picked = hurting.find((candidate) => candidate.id === symptom)
  const known = evidence(view)
  const answer = gap ? missing(view, gap) : null
  return (
    <section aria-label="Help me reason" className="space-y-3 rounded-md border border-accent/40 bg-accent-soft/60 p-2.5" data-testid="reasoning-flow">
      <div className="flex items-center justify-between">
        <Eyebrow className="text-accent">Let’s reason through this together</Eyebrow>
        <button type="button" aria-label="Close" onClick={onClose} className="-m-2 grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:text-fg sm:-m-1.5 sm:size-7">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <Step number={1} question="What is currently hurting?">
        <Chips options={hurting.map((candidate) => ({ id: candidate.id, label: candidate.label, mark: candidate.hurting }))} value={symptom} onChange={(id) => setSymptom(id as SymptomId)} label="What is currently hurting?" />
        {picked && (
          <p className="mt-1.5 text-[12.5px] leading-snug text-fg" data-testid="flow-symptom">
            {picked.reading}
          </p>
        )}
      </Step>

      {picked && (
        <Step number={2} question="What do we know?">
          <ul className="space-y-0.5 text-[12.5px] text-fg">
            {known.known.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {known.unknown.map((line) => (
              <li key={line} className="text-fg-muted">
                {line}: <span className="font-mono text-[11px] uppercase">Unknown</span>
              </li>
            ))}
          </ul>
        </Step>
      )}

      {picked && (
        <Step number={3} question="What important information are we missing?">
          <Chips options={MISSING.map((entry) => ({ id: entry.id, label: entry.label }))} value={gap} onChange={(id) => setGap(id as MissingId)} label="What important information are we missing?" />
          {answer && (
            <div className="mt-1.5 text-[12.5px] leading-snug text-fg" data-testid="flow-missing">
              <p>{answer.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {answer.action && (
                  <Button size="sm" onClick={() => onSelect(answer.action!.actionId)}>
                    <Search className="size-3.5 text-info" aria-hidden="true" />
                    {answer.action.title}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onHint}>
                  Give me a hint
                </Button>
              </div>
            </div>
          )}
        </Step>
      )}
    </section>
  )
}

function Step({ number, question, children }: { number: number; question: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex gap-1.5 text-[13px] font-semibold text-fg">
        <span className="font-mono text-xs text-accent">{number}</span>
        {question}
      </p>
      <div className="mt-1 pl-4">{children}</div>
    </div>
  )
}

function Chips({ options, value, onChange, label }: { options: { id: string; label: string; mark?: boolean }[]; value: string | null; onChange: (id: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const checked = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.id)}
            className={cn('flex items-center gap-1 min-h-9 rounded-full border px-3 py-1 text-[12.5px] sm:min-h-0 sm:px-2.5 sm:text-[12px] transition-colors', checked ? 'border-accent bg-accent text-white' : 'border-border-strong bg-surface text-fg hover:border-accent')}
          >
            {option.mark && <span className={cn('size-1.5 rounded-full', checked ? 'bg-white' : 'bg-failed')} aria-label="breaching" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
