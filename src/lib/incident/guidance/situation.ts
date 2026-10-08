/**
 * Reads the observable state as one of a few incident situations, the way an
 * experienced engineer would glance at the dashboard: is the app the limit,
 * the database, both, or is it too early to tell?
 */
import type { GuidanceContext } from './context'

export type SituationId =
  | 'stable'
  | 'over-budget'
  | 'failover'
  | 'beyond-capacity'
  | 'both-overloaded'
  | 'database-overloaded'
  | 'application-overloaded'
  | 'downstream-unknown'
  | 'cache-warming'
  | 'unclear'

export function situationOf({ view, causes }: GuidanceContext): SituationId {
  const status = (id: string) => causes.find((cause) => cause.id === id)?.status
  const breached = view.slos.some((slo) => slo.breached)
  const availability = view.metrics.availability.value
  const throttled = view.metrics.throttled.value ?? 0

  if (status('failover') === 'active') return 'failover'
  if (!breached) return view.budget.over ? 'over-budget' : 'stable'

  // A cache that came online in the last few minutes is still filling; its effect is still arriving.
  const hit = view.metrics.cacheHit.value
  const minutesOnline = [...view.metrics.cacheHit.series].reverse().findIndex((value) => value === 0)
  if (hit !== null && hit < 0.5 && minutesOnline !== -1 && minutesOnline <= 3) return 'cache-warming'

  // Most requests failing and nothing is turning traffic away.
  const collapsing = availability !== null && availability < 0.6 && throttled < 0.0005

  const app = status('application')
  const db = status('database')
  if (app === 'likely' && db === 'likely') return 'both-overloaded'
  if (db === 'likely') return 'database-overloaded'
  if (db === 'possible' && app !== 'likely' && app !== 'possible') return 'database-overloaded'
  // The visible tier is past capacity and failing most requests: more arrives than the system can take.
  if (app === 'likely' && collapsing) return 'beyond-capacity'
  if (app === 'likely' || app === 'possible') return 'application-overloaded'
  if (db === 'unknown') return 'downstream-unknown'
  if (collapsing) return 'beyond-capacity'
  return 'unclear'
}
