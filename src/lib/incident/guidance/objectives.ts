/**
 * "What are you trying to improve?": optional, and only used to show the
 * operator how their move did against what they wanted, from the numbers.
 */
import { metricValue } from '../format'
import type { MetricKey, Transition } from '../session'

export type ObjectiveId = 'latency' | 'failures' | 'capacity' | 'protect' | 'learn'

export const OBJECTIVES: { id: ObjectiveId; label: string; metrics: MetricKey[] }[] = [
  { id: 'latency', label: 'Reduce latency', metrics: ['p99'] },
  { id: 'failures', label: 'Reduce failures', metrics: ['errors', 'availability'] },
  { id: 'capacity', label: 'Increase capacity', metrics: ['appCpu', 'dbCpu'] },
  { id: 'protect', label: 'Protect the system', metrics: ['availability', 'errors'] },
  { id: 'learn', label: 'Learn what’s causing the problem', metrics: [] },
]

export interface ObjectiveResult {
  label: string
  /** `better`: moved the way they wanted. `worse`: the other way. `unclear`: mixed, or nothing to measure. */
  verdict: 'better' | 'worse' | 'unclear'
  text: string
}

/** How the move did against what the operator said they wanted. */
export function objectiveResult(id: string | null, transition: Transition): ObjectiveResult | null {
  const objective = OBJECTIVES.find((candidate) => candidate.id === id)
  if (!objective) return null
  if (objective.id === 'learn') {
    const learned = transition.revealed.map((value) => value.label.toLowerCase())
    return learned.length > 0
      ? { label: objective.label, verdict: 'better', text: `You learned ${learned.join(', ')}.` }
      : { label: objective.label, verdict: 'unclear', text: 'This move didn’t reveal anything new; watch how the numbers moved instead.' }
  }
  const deltas = objective.metrics.flatMap((key) => {
    const delta = transition.deltas.find((candidate) => candidate.key === key)
    return delta && delta.before !== null && delta.after !== null ? [delta] : []
  })
  if (deltas.length === 0) return { label: objective.label, verdict: 'unclear', text: 'None of the numbers for it moved noticeably.' }
  const better = deltas.filter((delta) => delta.better === true).length
  const worse = deltas.filter((delta) => delta.better === false).length
  const text = deltas.map((delta) => `${delta.label} ${metricValue(delta.unit, delta.before as number)} → ${metricValue(delta.unit, delta.after as number)}`).join(', ')
  return { label: objective.label, verdict: better > worse ? 'better' : worse > better ? 'worse' : 'unclear', text: `${text}.` }
}
