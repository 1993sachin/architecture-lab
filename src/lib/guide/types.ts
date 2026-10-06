/**
 * Guided experiments: a short scenario where the visitor performs real
 * actions on a live experiment and the guide explains what happened.
 *
 * A definition is plain data plus predicates over the experiment's own state,
 * so each experiment supplies its steps and the guide component owns the flow
 * (current step, progress, validation, hints, skip, restart, completion).
 */

/** The learning loop every experiment follows; each step belongs to one phase. */
export type LoopPhase = 'choose' | 'build' | 'break' | 'observe' | 'understand' | 'try-again'

export const LOOP_PHASES: LoopPhase[] = ['choose', 'build', 'break', 'observe', 'understand', 'try-again']

export const LOOP_LABELS: Record<LoopPhase, string> = {
  choose: 'Choose',
  build: 'Build',
  break: 'Break',
  observe: 'Observe',
  understand: 'Understand',
  'try-again': 'Try again',
}

/** What the guide remembers while a run is in progress (answers to questions, mostly). */
export interface GuideContext {
  /** Question id → id of the choice the visitor got right, once they have. */
  answers: Record<string, string>
  /** Free-form flags a step can set through a task action, e.g. "started". */
  flags: Record<string, boolean>
}

/** A single thing to do inside a step. It is done when its predicate holds. */
export interface GuidedTask<S> {
  id: string
  label: string
  done: (state: S, ctx: GuideContext) => boolean
  /** Hidden until this holds, e.g. "add the cache" only after the question is answered. */
  visible?: (state: S, ctx: GuideContext) => boolean
  /** Optional inline control that performs the action on the real experiment. */
  action?: { label: string; run: (ctx: GuideContext) => void; flag?: string }
  /** `data-guide-target` of the real control to highlight while this task is open. */
  target?: string
}

export interface ChoiceOption {
  id: string
  label: string
  correct?: boolean
  /** Shown after picking this option: a nudge when wrong, a confirmation when right. */
  feedback: string
}

export interface ChoiceQuestionDef {
  id: string
  prompt: string
  context?: string
  options: ChoiceOption[]
}

export interface GuidedStep<S> {
  id: string
  title: string
  description: string
  /** Short bullet points under the description, e.g. requirements. */
  details?: string[]
  phase: LoopPhase
  question?: ChoiceQuestionDef
  tasks?: GuidedTask<S>[]
  /** `data-guide-target`s to highlight for the whole step. */
  targetAction?: string[]
  /** When the step is complete. Defaults to "the question is answered and every visible task is done". */
  validation?: (state: S, ctx: GuideContext) => boolean
  /** "What happened?": shown once the step validates. */
  explanation: string | ((state: S) => string)
  /** A short chain of what the visitor just saw, e.g. CLOSED → OPEN. */
  evidence?: (state: S) => string[] | null
  /** Optional "notice that" line under the explanation. */
  observe?: string
  /** Progressive hints: a clue, then narrower, then the answer. */
  hints?: [string, string, string]
}

export interface LearningSummaryDef {
  topic: string
  points: Array<{ term: string; detail?: string }>
}

export interface GuideLink {
  label: string
  to: string
}

export interface GuidedExperimentDef<S> {
  id: string
  title: string
  /** The question the scenario poses. */
  scenario: string
  introduction: string
  steps: GuidedStep<S>[]
  completionMessage: string
  learned: LearningSummaryDef
  next: GuideLink[]
}

export const emptyContext = (): GuideContext => ({ answers: {}, flags: {} })

/** Default validation: the question (if any) is answered and every visible task is done. */
export function stepComplete<S>(step: GuidedStep<S>, state: S, ctx: GuideContext): boolean {
  if (step.validation) return step.validation(state, ctx)
  if (step.question && !ctx.answers[step.question.id]) return false
  return (step.tasks ?? []).every((t) => (t.visible && !t.visible(state, ctx)) || t.done(state, ctx))
}
