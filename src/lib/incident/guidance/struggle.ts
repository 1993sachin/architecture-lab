/**
 * Notices when the operator may be stuck, from what they did and what it did
 * to the system. It only ever suggests a hint; it never acts.
 */
import type { GuidanceContext } from './context'

export type StruggleSignal =
  | 'asked'
  | 'rejected'
  | 'not-improving'
  | 'deteriorating'
  | 'waiting'
  | 'rereading'
  | 'collapsing'

export interface Struggle {
  struggling: boolean
  signals: StruggleSignal[]
  /** The subtle prompt to show, if any. */
  prompt: string | null
}

const PROMPT: Record<StruggleSignal, string> = {
  asked: 'Let’s reason through this together.',
  rejected: 'A couple of moves didn’t go through. Want a hint?',
  'not-improving': 'Your last moves haven’t improved things yet. Want a hint?',
  deteriorating: 'Looks like the incident is getting harder. Want a hint?',
  waiting: 'The incident is still breaching while time passes. Want a hint?',
  rereading: 'Want to reason through what that number is telling you?',
  collapsing: 'Most requests are failing now. Want a hint?',
}

/** Signals in the order they are worth mentioning. */
const ORDER: StruggleSignal[] = ['asked', 'collapsing', 'deteriorating', 'not-improving', 'rejected', 'waiting', 'rereading']

export function detectStruggle({ view, history }: GuidanceContext): Struggle {
  const signals = new Set<StruggleSignal>()
  const breached = view.slos.some((slo) => slo.breached)
  const moves = history.outcomes.filter((outcome) => outcome.kind !== 'start')
  const changes = moves.filter((outcome) => outcome.kind === 'change')
  const recent = moves.slice(-2)

  if (history.stuck > 0) signals.add('asked')
  if (history.rejections >= 2) signals.add('rejected')
  if (changes.length >= 2 && changes.slice(-2).every((outcome) => outcome.impact !== 'better' && outcome.breachedAfter)) signals.add('not-improving')
  if (recent.length === 2 && recent.every((outcome) => outcome.impact === 'worse')) signals.add('deteriorating')
  if (breached && recent.length === 2 && recent.every((outcome) => outcome.kind === 'wait' && outcome.breachedAfter)) signals.add('waiting')
  if (Object.values(history.explanationOpens).some((opens) => opens >= 3)) signals.add('rereading')
  const availability = view.metrics.availability.value
  if (breached && availability !== null && availability < 0.5 && moves.length > 0) signals.add('collapsing')

  const ordered = ORDER.filter((signal) => signals.has(signal))
  return { struggling: ordered.length > 0, signals: ordered, prompt: ordered.length > 0 ? PROMPT[ordered[0] as StruggleSignal] : null }
}

/**
 * How far up the ladder the next request for help should go. Each ask climbs
 * one rung from the last one shown for this situation.
 */
export function nextLevel(current: 0 | 2 | 3 | 4): 2 | 3 | 4 {
  return current === 0 ? 2 : current === 2 ? 3 : 4
}
