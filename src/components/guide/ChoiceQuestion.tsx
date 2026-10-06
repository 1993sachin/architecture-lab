import { useEffect, useState } from 'react'
import { CircleCheck, CircleX } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ChoiceQuestionDef } from '@/lib/guide/types'

interface ChoiceQuestionProps {
  question: ChoiceQuestionDef
  /** The correct choice, once answered. */
  answer?: string
  onCorrect: (choiceId: string) => void
}

/** A small reasoning question. Wrong answers get a nudge and another try; nothing is revealed up front. */
export function ChoiceQuestion({ question, answer, onCorrect }: ChoiceQuestionProps) {
  const [picked, setPicked] = useState<string | null>(answer ?? null)
  useEffect(() => {
    setPicked(answer ?? null)
  }, [question.id, answer])

  const chosen = question.options.find((o) => o.id === picked)
  return (
    <fieldset>
      {question.context && <p className="text-[13px] text-fg-muted">{question.context}</p>}
      <legend className="sr-only">{question.prompt}</legend>
      <p className="mt-1 text-[14px] font-medium text-fg" aria-hidden="true">
        {question.prompt}
      </p>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
        {question.options.map((o) => {
          const isPicked = picked === o.id
          const locked = !!answer
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={isPicked}
              disabled={locked && !o.correct}
              onClick={() => {
                setPicked(o.id)
                if (o.correct) onCorrect(o.id)
              }}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-[13px] font-medium transition-colors disabled:opacity-50',
                isPicked && o.correct
                  ? 'border-healthy/60 bg-healthy/10 text-fg'
                  : isPicked
                    ? 'border-failed/50 bg-failed/10 text-fg'
                    : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
              )}
            >
              {isPicked && o.correct && <CircleCheck className="size-4 shrink-0 text-healthy" aria-hidden="true" />}
              {isPicked && !o.correct && <CircleX className="size-4 shrink-0 text-failed" aria-hidden="true" />}
              {o.label}
            </button>
          )
        })}
      </div>
      <p aria-live="polite" className={cn('mt-2 min-h-5 text-[13px]', chosen?.correct ? 'text-fg' : 'text-fg-muted')}>
        {chosen && (
          <>
            <span className={cn('font-medium', chosen.correct ? 'text-healthy' : 'text-failed')}>
              {chosen.correct ? 'Correct. ' : 'Not quite. '}
            </span>
            {chosen.feedback}
            {!chosen.correct && <span className="text-fg-subtle"> Try again.</span>}
          </>
        )}
      </p>
    </fieldset>
  )
}
