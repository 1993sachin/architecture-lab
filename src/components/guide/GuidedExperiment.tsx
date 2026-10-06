import { useEffect, useRef } from 'react'
import { GraduationCap, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { stepComplete, type GuidedExperimentDef } from '@/lib/guide/types'
import { useGuideRun, useGuideStore } from '@/store/guideStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CompletionCard } from './CompletionCard'
import { ExperimentIntro } from './ExperimentIntro'
import { ExperimentProgress } from './ExperimentProgress'
import { GuidedStep } from './GuidedStep'
import { LearningLoop } from './LearningLoop'
import { useGuideHighlight } from './useGuideHighlight'

interface GuidedExperimentProps<S> {
  guide: GuidedExperimentDef<S>
  /** The experiment's live state; steps validate against it. */
  state: S
  /** Puts the experiment back to the guide's starting point (called on start and restart). */
  onStart: () => void
  className?: string
}

/**
 * Runs a guided experiment inline, on top of the real experiment: current
 * step, progress, validation, hints, skip, restart and completion. Each
 * experiment only supplies its steps.
 */
export function GuidedExperiment<S>({ guide, state, onStart, className }: GuidedExperimentProps<S>) {
  const run = useGuideRun(guide.id)
  const hasRun = useGuideStore((s) => !!s.runs[guide.id])
  const { start, pass, next, answer, flag, complete, dismiss } = useGuideStore.getState()
  const heading = useRef<HTMLHeadingElement>(null)
  const firstStep = useRef(true)

  const restart = () => {
    start(guide.id)
    onStart()
  }

  // A visit without a run in progress starts one from a clean experiment.
  useEffect(() => {
    if (!hasRun) restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRun])

  const step = guide.steps[Math.min(run.step, guide.steps.length - 1)]
  const passed = run.passed >= run.step
  const nowComplete = !run.done && stepComplete(step, state, run.ctx)

  useEffect(() => {
    if (nowComplete && !passed) pass(guide.id, run.step)
  }, [nowComplete, passed, pass, guide.id, run.step])

  useEffect(() => {
    if (run.done) complete(guide.id)
  }, [run.done, complete, guide.id])

  // Move focus to the new step for keyboard and screen-reader users (not on first render).
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    heading.current?.focus({ preventScroll: true })
  }, [run.step])

  const openTargets =
    run.done || passed
      ? []
      : [
          ...(step.targetAction ?? []),
          ...(step.tasks ?? [])
            .filter((t) => t.target && (!t.visible || t.visible(state, run.ctx)) && !t.done(state, run.ctx))
            .map((t) => t.target!),
        ]
  useGuideHighlight(openTargets)

  return (
    <Card
      className={cn('overflow-hidden border-accent/40', className)}
      aria-label={`Guided experiment: ${guide.title}`}
      role="region"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-accent-soft/40 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
          <GraduationCap className="size-4 text-accent" aria-hidden="true" /> Guided Mode
          <span className="font-normal text-fg-subtle">· {guide.title}</span>
        </span>
        <ExperimentProgress current={run.step} total={guide.steps.length} done={run.done} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={restart}>
            <RotateCcw className="size-3.5" aria-hidden="true" /> Restart
          </Button>
          {!run.done && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => dismiss(guide.id)}>
              <X className="size-3.5" aria-hidden="true" /> Skip guide
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {run.done ? (
          <CompletionCard
            title={guide.title}
            message={guide.completionMessage}
            learned={guide.learned}
            next={guide.next}
            onExplore={() => dismiss(guide.id)}
            onRestart={restart}
          />
        ) : (
          <>
            {run.step === 0 && <ExperimentIntro scenario={guide.scenario} introduction={guide.introduction} />}
            <LearningLoop active={step.phase} />
            <GuidedStep
              ref={heading}
              step={step}
              index={run.step}
              state={state}
              ctx={run.ctx}
              passed={passed}
              isLast={run.step === guide.steps.length - 1}
              nextTitle={guide.steps[run.step + 1]?.title}
              onAnswer={(q, c) => answer(guide.id, q, c)}
              onFlag={(f) => flag(guide.id, f)}
              onContinue={() => next(guide.id, guide.steps.length)}
            />
          </>
        )}
      </div>
    </Card>
  )
}
