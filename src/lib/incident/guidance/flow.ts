/**
 * "Help me reason": a short structured walk, not a conversation. What is
 * hurting, what do we know, what are we missing, then the next useful step.
 * Every answer is read from the observable view.
 */
import { metricValue, ms, percent } from '../format'
import { guideFor } from '../guide'
import { databaseName } from '../reasoning'
import type { IncidentView, MetricKey } from '../session'
import type { HintAction } from './hints'

const pct = (ratio: number) => percent(ratio, 0)

export type SymptomId = 'latency' | 'errors' | 'availability' | 'capacity'

export interface Symptom {
  id: SymptomId
  label: string
  /** Is this breaching an SLO, or past capacity, right now? */
  hurting: boolean
  /** What the evidence says about it. */
  reading: string
}

function slo(view: IncidentView, key: MetricKey) {
  return view.slos.find((candidate) => candidate.metric === key)
}

function sloLine(view: IncidentView, key: MetricKey, label: string): Symptom['reading'] {
  const metric = view.metrics[key]
  const target = slo(view, key)
  if (metric.value === null) return `${label} can’t be seen right now.`
  const value = metricValue(metric.unit, metric.value)
  if (!target) return `${label} is ${value}.`
  const limit = metricValue(metric.unit, target.limit)
  return target.breached
    ? `${label} is ${value}; the SLO is ${target.bound === 'max' ? 'at most' : 'at least'} ${limit}. It is breaching.`
    : `${label} is ${value}, within its SLO (${limit}).`
}

export function symptoms(view: IncidentView): Symptom[] {
  const app = view.metrics.appCpu.value
  const db = view.metrics.dbCpu.value
  const tiers = [app !== null ? `application CPU ${pct(app)}` : null, db !== null ? `${databaseName(view)} CPU ${pct(db)}` : `${databaseName(view)} CPU unknown`].filter(Boolean)
  const overloaded = (app ?? 0) >= 1 || (db ?? 0) >= 1
  return [
    { id: 'latency', label: 'Latency', hurting: Boolean(slo(view, 'p99')?.breached), reading: sloLine(view, 'p99', 'p99 latency') },
    { id: 'errors', label: 'Errors', hurting: (view.metrics.errors.value ?? 0) > 0.01, reading: view.metrics.errors.value === null ? 'Errors can’t be seen right now.' : `${pct(view.metrics.errors.value)} of requests are failing.` },
    { id: 'availability', label: 'Availability', hurting: Boolean(slo(view, 'availability')?.breached), reading: sloLine(view, 'availability', 'Availability') },
    { id: 'capacity', label: 'Capacity', hurting: overloaded, reading: `${tiers.join(', ')}. ${overloaded ? 'Something is past its capacity.' : 'Nothing you can see is past its capacity.'}` },
  ]
}

export interface Evidence {
  known: string[]
  unknown: string[]
}

/** What the operator can see, and what they can't yet. */
export function evidence(view: IncidentView): Evidence {
  const known: string[] = []
  const unknown: string[] = []
  const m = view.metrics
  if (m.traffic.value !== null) known.push(`Traffic: ${metricValue('rps', m.traffic.value)}`)
  if (m.p99.value !== null) known.push(`p99 latency: ${ms(m.p99.value)}`)
  if (m.errors.value !== null) known.push(`Errors: ${pct(m.errors.value)}`)
  if (m.appCpu.value !== null) known.push(`Application CPU: ${pct(m.appCpu.value)}`)
  if (m.dbCpu.value !== null) known.push(`${databaseName(view)} CPU: ${pct(m.dbCpu.value)}`)
  if (!m.cacheHit.absent && m.cacheHit.value !== null) known.push(`Cache hit rate: ${pct(m.cacheHit.value)}`)
  for (const fact of view.known) if (!known.some((line) => line.startsWith(fact.label))) known.push(`${fact.label}: ${fact.text}`)
  for (const fact of view.unknown) if (!unknown.some((line) => line.startsWith(fact.label))) unknown.push(fact.label)
  return { known, unknown: [...new Set(unknown)] }
}

export type MissingId = 'database' | 'application' | 'cache' | 'composition'

export interface MissingAnswer {
  id: MissingId
  label: string
  /** `unknown`: you can find out. `known`: you already have it. `absent`: nothing to measure yet. */
  status: 'unknown' | 'known' | 'absent'
  text: string
  /** The investigation that would find out, when there is one. */
  action?: HintAction
}

function revealer(view: IncidentView, factId: string | undefined): HintAction | undefined {
  const unknown = factId ? view.unknown.find((fact) => fact.id === factId) : undefined
  const action = unknown && view.actions.find((candidate) => candidate.enabled && unknown.revealedBy.includes(candidate.title))
  return action ? { actionId: action.id, title: action.title, kind: action.kind } : undefined
}

export const MISSING: { id: MissingId; label: string }[] = [
  { id: 'database', label: 'Database utilization' },
  { id: 'application', label: 'Application utilization' },
  { id: 'cache', label: 'Cache effectiveness' },
  { id: 'composition', label: 'Traffic composition' },
]

export function missing(view: IncidentView, id: MissingId): MissingAnswer {
  const roles = guideFor(view.scenarioId).facts
  const label = MISSING.find((entry) => entry.id === id)?.label ?? id
  const db = databaseName(view)
  switch (id) {
    case 'database': {
      const value = view.metrics.dbCpu.value
      if (value !== null) return { id, label, status: 'known', text: `You already know this: ${db} CPU is ${pct(value)}. What does it say about where the limit is?` }
      const action = revealer(view, roles.databaseLoad)
      return { id, label, status: 'unknown', text: `You don’t know how busy ${db} is. If it is saturated, adding application capacity sends it even more work; if it has room, the limit is elsewhere.`, action }
    }
    case 'application': {
      const value = view.metrics.appCpu.value
      return value === null
        ? { id, label, status: 'unknown', text: 'Application utilization can’t be seen right now.' }
        : { id, label, status: 'known', text: `You already know this: application CPU is ${pct(value)}${value < 0.85 ? ', so it has room' : ''}. What does that rule in or out?` }
    }
    case 'cache': {
      const value = view.metrics.cacheHit.value
      if (view.metrics.cacheHit.absent || value === null) return { id, label, status: 'absent', text: 'There is no cache yet, so there is nothing to measure. Whether one would help depends on what the traffic is made of.' }
      return { id, label, status: 'known', text: `The cache answers ${pct(value)} of reads; the rest reach ${db}.` }
    }
    case 'composition': {
      const known = view.known.filter((fact) => fact.id === roles.readShare || fact.id === roles.cacheableShare)
      if (known.length > 0) return { id, label, status: 'known', text: `You already know this: ${known.map((fact) => `${fact.label.toLowerCase()} ${fact.text}`).join(', ')}. Which fixes does that make more or less attractive?` }
      const action = revealer(view, roles.readShare)
      return { id, label, status: 'unknown', text: 'You don’t know what the traffic is made of: mostly reads, or writes, and how repetitive. That decides which fixes can work.', action }
    }
  }
}
