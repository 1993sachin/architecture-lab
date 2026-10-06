import { forwardRef } from 'react'
import { ArrowRight, Check, Circle } from 'lucide-react'
import { stepComplete, type GuideContext, type GuidedStep as GuidedStepDef } from '@/lib/guide/types'
import { Button } from '@/components/ui/Button'
import { ChoiceQuestion } from './ChoiceQuestion'
import { HintPanel } from './HintPanel'

interface GuidedStepProps<S> {
  step: GuidedStepDef<S>
  index: number
  state: S
  ctx: GuideContext
  /** The step validated at some point; it stays complete. */
  passed: boolean
  isLast: boolean
  nextTitle?: string
  onAnswer: (question: string, choice: string) => void
  onFlag: (flag: string) => void
  onContinue: () => void
}

function GuidedStepInner<S>(
  { step, index, state, ctx, passed, isLast, nextTitle, onAnswer, onFlag, onContinue }: GuidedStepProps<S>,
  ref: React.ForwardedRef<HTMLHeadingElement>,
) {
  const tasks = (step.tasks ?? []).filter((t) => !t.visible || t.visible(state, ctx))
  const answered = !step.question || !!ctx.answers[step.question.id]
  const explanation = typeof step.explanation === 'function' ? step.explanation(state) : step.explanation
  const evidence = passed ? step.evidence?.(state) : null
  const complete = passed || stepComplete(step, state, ctx)

  return (
    <div className="space-y-3">
      <div>
        <h3 ref={ref} tabIndex={-1} className="text-[15px] font-semibold text-fg outline-none">
          <span className="mr-1.5 font-mono text-[11px] font-normal text-fg-subtle">Step {index + 1}</span>
          {step.title}
        </h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">{step.description}</p>
        {step.details && (
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {step.details.map((d) => (
              <li key={d} className="flex gap-2 text-[13px] text-fg">
                <span className="text-accent" aria-hidden="true">
                  •
                </span>
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>

      {step.question && (
        <ChoiceQuestion
          question={step.question}
          answer={ctx.answers[step.question.id]}
          onCorrect={(c) => onAnswer(step.question!.id, c)}
        />
      )}

      {answered && tasks.length > 0 && (
        <ul className="space-y-1.5" aria-label="What to do">
          {tasks.map((t) => {
            const done = passed || t.done(state, ctx)
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                {done ? (
                  <Check className="size-4 shrink-0 text-healthy" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                )}
                <span className={done ? 'text-[13px] text-fg-muted line-through decoration-fg-subtle/50' : 'text-[13px] text-fg'}>
                  {t.label}
                  <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
                </span>
                {!done && t.action && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7"
                    onClick={() => {
                      t.action!.run(ctx)
                      if (t.action!.flag) onFlag(t.action!.flag)
                    }}
                  >
                    {t.action.label}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {complete ? (
        <div className="rounded-md border border-accent/30 bg-accent-soft/60 px-3.5 py-3" role="status" aria-live="polite">
          <p className="font-mono text-[10.5px] tracking-wider text-accent uppercase">What happened?</p>
          {evidence && evidence.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] text-fg">
              {evidence.map((e, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-fg-subtle">→</span>}
                  <span className="rounded border border-border bg-surface px-1.5 py-0.5">{e}</span>
                </span>
              ))}
            </p>
          )}
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg">{explanation}</p>
          {step.observe && <p className="mt-1.5 text-[13px] text-fg-muted">{step.observe}</p>}
          <Button variant="primary" size="sm" className="mt-3" onClick={onContinue}>
            {isLast ? 'Finish' : `Your turn: ${nextTitle}`} <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        step.hints && <HintPanel hints={step.hints} resetKey={step.id} />
      )}
    </div>
  )
}

export const GuidedStep = forwardRef(GuidedStepInner) as <S>(
  props: GuidedStepProps<S> & { ref?: React.ForwardedRef<HTMLHeadingElement> },
) => ReturnType<typeof GuidedStepInner>
