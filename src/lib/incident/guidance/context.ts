/**
 * What guidance knows: the observable view, the possible causes read from
 * it, and what the operator has done so far. Nothing else, so the same state
 * and history always produce the same guidance.
 */
import { explainConsequence, hypotheses, type Hypothesis } from '../reasoning'
import type { IncidentView, MetricKey, Transition } from '../session'

/** One move and what it did to what users feel. */
export interface MoveOutcome {
  time: number
  kind: 'start' | 'wait' | 'investigate' | 'change'
  decisionId?: string
  /** Did the impact metrics get better or worse overall? */
  impact: 'better' | 'worse' | 'same'
  improved: MetricKey[]
  worsened: MetricKey[]
  breachedAfter: boolean
  availabilityAfter: number | null
}

export interface GuidanceUse {
  hints: number
  strongHints: number
  rescues: number
  reasoningFlows: number
  explanations: number
}

export interface GuidanceHistory {
  outcomes: MoveOutcome[]
  /** Decisions the engine refused. */
  rejections: number
  /** How often each explanation was opened, by metric or concept id. */
  explanationOpens: Record<string, number>
  /** Times the operator said they were stuck. */
  stuck: number
  used: GuidanceUse
}

export const EMPTY_HISTORY: GuidanceHistory = {
  outcomes: [],
  rejections: 0,
  explanationOpens: {},
  stuck: 0,
  used: { hints: 0, strongHints: 0, rescues: 0, reasoningFlows: 0, explanations: 0 },
}

const IMPACT: MetricKey[] = ['availability', 'p99', 'errors', 'throttled']

export function outcomeOf(transition: Transition): MoveOutcome {
  const explained = explainConsequence(transition)
  const better = explained.improved.filter((delta) => IMPACT.includes(delta.key)).length
  const worse = explained.worsened.filter((delta) => IMPACT.includes(delta.key)).length
  const decision = transition.decision
  return {
    time: transition.to,
    kind: decision ? decision.kind : transition.start ? 'start' : 'wait',
    decisionId: decision?.id,
    impact: worse > better ? 'worse' : better > worse ? 'better' : 'same',
    improved: explained.improved.map((delta) => delta.key),
    worsened: explained.worsened.map((delta) => delta.key),
    breachedAfter: transition.after.slos.some((slo) => slo.breached),
    availabilityAfter: transition.after.metrics.availability.value,
  }
}

export interface GuidanceContext {
  view: IncidentView
  causes: Hypothesis[]
  history: GuidanceHistory
}

export function guidanceContext(view: IncidentView, history: GuidanceHistory = EMPTY_HISTORY, causes: Hypothesis[] = hypotheses(view)): GuidanceContext {
  return { view, causes, history }
}
