/**
 * After a move that didn't go as hoped: not a verdict, a new clue. Read from
 * what was visible before and after, and phrased as the next question.
 */
import { decisionGuide } from '../explain'
import { databaseName } from '../reasoning'
import type { Transition } from '../session'
import { outcomeOf } from './context'

export interface Clue {
  text: string
  question: string
}

export function newClue(transition: Transition): Clue | null {
  const decision = transition.decision
  if (!decision) return null
  const { before, after } = transition
  const outcome = outcomeOf(transition)
  const db = databaseName(after)
  const value = (view: typeof before, key: 'appCpu' | 'dbCpu' | 'traffic' | 'cacheHit') => view.metrics[key].value
  const appBefore = value(before, 'appCpu')
  const appAfter = value(after, 'appCpu')
  const dbBefore = value(before, 'dbCpu')
  const dbAfter = value(after, 'dbCpu')
  const appRelieved = appBefore !== null && appAfter !== null && appAfter < appBefore - 0.05
  const notBetter = outcome.impact !== 'better'

  if (decision.kind === 'investigate') {
    const trafficBefore = value(before, 'traffic')
    const trafficAfter = value(after, 'traffic')
    if (outcome.impact === 'worse' && trafficBefore && trafficAfter && trafficAfter > trafficBefore * 1.3)
      return { text: 'Most of this change came from traffic, not from your investigation. Investigating changes nothing in the system; it reduces uncertainty.', question: 'Now that you know more, what does the new evidence point at?' }
    return null
  }

  if (appRelieved && dbBefore !== null && dbAfter !== null && dbAfter > dbBefore + 0.05 && notBetter)
    return { text: `The bottleneck appears to have shifted downstream: the application has more room, and ${db} is now doing more work.`, question: 'What would you look at now?' }
  const guide = decisionGuide({ id: decision.id, kind: decision.kind, description: '' }, after.scenarioId)
  if (guide.group === 'capacity' && (guide.addresses ?? []).includes('application') && dbAfter === null && notBetter)
    return { text: `More application capacity didn’t make things better. The application may not be what limits the system; ${db}, which you can’t see yet, could be.`, question: 'What would tell you?' }
  const hit = value(after, 'cacheHit')
  if (value(before, 'cacheHit') === null && hit !== null && hit < 0.5 && notBetter)
    return { text: `The cache started empty and is filling: it answers ${Math.round(hit * 100)}% of reads so far. Its effect is still arriving.`, question: 'What do you expect to happen if you give it a minute?' }
  if (outcome.impact === 'worse')
    return { text: 'This didn’t go the way you hoped. That is evidence too: it tells you something about where the limit is.', question: 'What does it rule out?' }
  return null
}
