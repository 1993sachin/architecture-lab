/**
 * "What are you trying to improve?": optional, and only used to show the
 * operator how their move did against what they wanted, from the numbers.
 */
import { metricValue, percent, rps } from '../format'
import type { MetricKey, Transition } from '../session'

export type ObjectiveId = 'latency' | 'failures' | 'capacity' | 'protect' | 'learn'

export const OBJECTIVES: { id: ObjectiveId; label: string; metrics: MetricKey[] }[] = [
  { id: 'latency', label: 'Reduce latency', metrics: ['p99'] },
  { id: 'failures', label: 'Reduce failures', metrics: ['errors', 'availability'] },
  // Judged by work served, not utilization: see `capacityResult`.
  { id: 'capacity', label: 'Increase capacity', metrics: [] },
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
  if (objective.id === 'capacity') return capacityResult(objective.label, transition)
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

/**
 * More capacity means the system can serve more work without failing more of
 * it. Utilization can't show that: it also moves when traffic moves or when
 * another tier becomes the limit. What the operator can observe is how many
 * requests were actually served (traffic × availability) and the error rate,
 * so that is what this judges. A move can only demonstrate more capacity when
 * there is demand it wasn't serving before.
 */
function capacityResult(label: string, transition: Transition): ObjectiveResult {
  const read = (view: Transition['before']) => {
    const traffic = view.metrics.traffic.value
    const availability = view.metrics.availability.value
    return traffic === null || availability === null ? null : { traffic, served: traffic * availability, errors: view.metrics.errors.value ?? 0 }
  }
  const before = read(transition.before)
  const after = read(transition.after)
  if (!before || !after) return { label, verdict: 'unclear', text: 'Throughput can’t be measured right now.' }
  const served = `Successful requests ${rps(before.served)} → ${rps(after.served)}, errors ${percent(before.errors, 1)} → ${percent(after.errors, 1)}`
  const moreServed = after.served > before.served * 1.05
  const lessServed = after.served < before.served * 0.95
  const moreErrors = after.errors > before.errors + 0.01
  if (moreServed && !moreErrors) return { label, verdict: 'better', text: `${served}: the system served more work without failing more of it.` }
  if (lessServed || (moreErrors && !moreServed)) return { label, verdict: 'worse', text: `${served}: the system served less of the demand than before.` }
  if (moreServed && moreErrors) return { label, verdict: 'unclear', text: `${served}: it served more work, but also failed a larger share of it.` }
  if (before.served >= before.traffic * 0.99) return { label, verdict: 'unclear', text: `${served}. Everything offered was already being served, so this move can’t show extra capacity yet.` }
  return { label, verdict: 'unclear', text: `${served}. No clear change in how much work the system can serve; lower utilization alone doesn’t prove more capacity.` }
}
