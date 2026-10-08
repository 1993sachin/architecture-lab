/**
 * Explanations the operator can ask for: what a metric means and what it
 * says right now, what an action is for, and what a learned fact implies.
 *
 * Generic over scenarios: concepts come from the concept catalogue, scenario
 * wording from the scenario guide, and every live statement from the
 * IncidentView, which only holds what the operator can observe.
 */
import { concept, type ConceptId, type EngineeringConcept } from '@/lib/learning/concepts'
import { metricValue, ms, percent, rps, usd } from './format'
import { GROUPS, guideFor, type DecisionGuide } from './guide'
import { databaseName, hypotheses, relationships, type Chain, type Hypothesis, type HypothesisStatus } from './reasoning'
import type { ActionView, IncidentView, KnownFact, MetricKey } from './session'

const pct = (ratio: number) => percent(ratio, 0)

/** Which concept explains each metric on screen. */
export const METRIC_CONCEPT: Record<MetricKey, ConceptId> = {
  traffic: 'rps',
  p99: 'p99',
  errors: 'error-rate',
  throttled: 'throttling',
  availability: 'availability',
  appCpu: 'cpu',
  dbCpu: 'cpu',
  cacheHit: 'cache-hit-rate',
  queue: 'queue-depth',
  cost: 'monthly-cost',
}

export interface Reading {
  /** `concern`: worth acting on. `watch`: close to a line. `fine`: nothing wrong. `unknown`: can't tell. */
  tone: 'concern' | 'watch' | 'fine' | 'unknown'
  title: string
  text: string
}

export interface MetricExplanation {
  key: MetricKey
  label: string
  concept: EngineeringConcept
  /** Shown alongside, e.g. p95 next to p99. */
  also: EngineeringConcept[]
  /** The current value as shown on screen, or null when it can't be seen. */
  value: string | null
  example: string[]
  /** True when the example uses the live value rather than a sample. */
  exampleIsLive: boolean
  /** What this value means right now. Context, not a blanket "high is bad". */
  reading: Reading | null
  /** Why it might be at this value, from what is observable. Hedged. */
  why: string[]
  /** When the value can't be seen: what we don't know and how to find out. */
  unknown?: { text: string; check?: { actionId: string; title: string } }
  /** The chains this metric is part of, only those the current state supports. */
  chains: Chain[]
}

export function explainMetric(key: MetricKey, view: IncidentView, causes: Hypothesis[] = hypotheses(view)): MetricExplanation {
  const metric = view.metrics[key]
  const base = concept(METRIC_CONCEPT[key])
  const live = metric.value
  const example = base.example ? base.example(live ?? base.sample ?? 0) : []
  const also = key === 'p99' ? [concept('p95'), concept('latency')] : key === 'appCpu' || key === 'dbCpu' ? [concept('bottleneck')] : key === 'errors' ? [concept('availability')] : []
  const label = key === 'dbCpu' ? `${databaseName(view)} CPU` : key === 'appCpu' ? 'Application CPU' : metric.label
  const explanation: MetricExplanation = {
    key,
    label,
    concept: base,
    also,
    value: live === null ? null : metricValue(metric.unit, live),
    example: base.example && live === null && metric.absent ? [] : example,
    exampleIsLive: live !== null,
    reading: null,
    why: [],
    chains: relationships(view, causes).filter((chain) => chain.metrics.includes(key)),
  }
  if (live === null) {
    if (metric.absent) {
      explanation.reading = { tone: 'fine', title: 'Right now', text: ABSENT[key] ?? 'Not part of the system right now.' }
      return explanation
    }
    const cause = key === 'dbCpu' ? causes.find((candidate) => candidate.id === 'database') : undefined
    const roles = guideFor(view.scenarioId)
    const note = key === 'dbCpu' && roles.facts.databaseLoad ? roles.factGuides[roles.facts.databaseLoad]?.unknown : undefined
    explanation.unknown = { text: `${note ?? 'We don’t currently have enough information to know this.'} Without it, you can’t tell whether this component is saturated.`, check: cause?.check }
    explanation.reading = { tone: 'unknown', title: 'Right now', text: 'Unknown. Nothing on screen tells you this yet.' }
    return explanation
  }
  explanation.reading = reading(key, live, view)
  explanation.why = whyNow(key, live, view, causes)
  return explanation
}

const ABSENT: Partial<Record<MetricKey, string>> = {
  cacheHit: 'No cache is deployed, so every read goes to the database.',
  queue: 'No write queue is deployed, so every write goes straight to the database.',
}

function sloFor(view: IncidentView, key: MetricKey) {
  return view.slos.find((candidate) => candidate.metric === key)
}

function trend(view: IncidentView, key: MetricKey, minutes = 3): number | null {
  const series = view.metrics[key].series
  if (series.length < 2) return null
  return series[Math.max(0, series.length - 1 - minutes)] ?? null
}

function reading(key: MetricKey, live: number, view: IncidentView): Reading {
  const slo = sloFor(view, key)
  switch (key) {
    case 'p99': {
      const limit = slo?.limit ?? null
      if (slo?.breached) return { tone: 'concern', title: 'Why might this be bad?', text: `Users are experiencing slow responses: the slowest 1 in 100 requests take longer than ${ms(live)}. The SLO allows ${ms(limit as number)}.` }
      if (limit !== null && live > limit * 0.8) return { tone: 'watch', title: 'Why might this matter?', text: `Close to the ${ms(limit)} SLO. Latency rises steeply once something nears its capacity, so it can cross quickly.` }
      return { tone: 'fine', title: 'Right now', text: limit !== null ? `Within the ${ms(limit)} SLO.` : 'Responses are reasonably fast.' }
    }
    case 'availability': {
      const failing = Math.max(0, Math.round((1 - live) * 100))
      if (slo?.breached) return { tone: 'concern', title: 'Why might this be bad?', text: `About ${failing} in every 100 requests fail or are turned away. The SLO needs at least ${percent(slo.limit)}.` }
      return { tone: 'fine', title: 'Right now', text: slo ? `Meeting the ${percent(slo.limit)} SLO.` : 'Most requests succeed.' }
    }
    case 'errors':
      if (live > 0.005) return { tone: 'concern', title: 'Why might this be bad?', text: `About ${(live * 1000).toFixed(live * 1000 < 10 ? 1 : 0)} in every 1,000 requests fail with an error page. Each one counts against availability.` }
      if (live > 0) return { tone: 'watch', title: 'Why might this matter?', text: 'A few requests fail. Small error rates are normal, but a rising one is often the first sign of overload.' }
      return { tone: 'fine', title: 'Right now', text: 'No server errors.' }
    case 'throttled':
      if (live > 0.0005)
        return {
          tone: 'watch',
          title: 'Why might this matter?',
          text: `Your rate limit is turning away ${pct(live)} of requests on purpose. That protects what is behind the gateway, but each one is a real user who was not served, and it counts against availability.`,
        }
      return { tone: 'fine', title: 'Right now', text: 'Nothing is being turned away.' }
    case 'appCpu':
    case 'dbCpu': {
      const who = key === 'dbCpu' ? 'The database' : 'The application tier'
      if (live >= 1) return { tone: 'concern', title: 'Why might this be bad?', text: `${who} is receiving more work than it can process. Requests wait in line, slow down, and then start failing.` }
      if (live >= 0.85) return { tone: 'watch', title: 'Why might this be bad?', text: `${who} may be approaching its processing capacity. Additional traffic can increase latency or failures.` }
      return { tone: 'fine', title: 'Right now', text: `${who} has headroom. On its own, it is not what slows requests down.` }
    }
    case 'cacheHit':
      if (live < 0.5) return { tone: 'watch', title: 'Why might this matter?', text: 'More requests are reaching the database instead of being served from cache.' }
      return { tone: 'fine', title: 'Right now', text: `Most reads (${pct(live)}) are served from cache, so far fewer reach the database.` }
    case 'queue': {
      const before = trend(view, 'queue')
      if (live <= 0) return { tone: 'fine', title: 'Right now', text: 'Empty: writes are being processed as fast as they arrive.' }
      if (before !== null && live > before * 1.05)
        return { tone: 'concern', title: 'Why might this matter?', text: 'Work is accumulating faster than it is being processed. If the queue keeps growing, users may see delays, or the system may eventually run out of room.' }
      return { tone: 'watch', title: 'Why might this matter?', text: 'Writes are waiting, but the backlog is not growing. They will reach the database later.' }
    }
    case 'traffic': {
      const start = view.metrics.traffic.series[0] ?? live
      const times = start > 0 ? live / start : 1
      return times >= 1.5
        ? { tone: 'watch', title: 'Why might this matter?', text: `About ${Number(times.toFixed(1))}× the traffic your shift started with. Every component has to absorb it.` }
        : { tone: 'fine', title: 'Right now', text: 'Close to where your shift started.' }
    }
    case 'cost': {
      const { limit, headroom } = view.budget
      if (limit === null || headroom === null) return { tone: 'fine', title: 'Right now', text: `${usd(live)}/month.` }
      if (view.budget.over) return { tone: 'concern', title: 'Why might this be bad?', text: `${usd(-headroom)}/month over a budget of ${usd(limit)}.` }
      return { tone: headroom < limit * 0.15 ? 'watch' : 'fine', title: 'Right now', text: `${usd(headroom)}/month left in a budget of ${usd(limit)}.` }
    }
  }
}

function whyNow(key: MetricKey, live: number, view: IncidentView, causes: Hypothesis[]): string[] {
  const of = (id: Hypothesis['id']) => causes.find((cause) => cause.id === id)
  const traffic = of('traffic')
  const lines: string[] = []
  switch (key) {
    case 'p99':
    case 'errors':
    case 'availability': {
      const struggling = view.slos.some((candidate) => candidate.breached) || (key === 'errors' && live > 0.005)
      if (!struggling) return []
      if (traffic && traffic.status !== 'unlikely') lines.push(traffic.evidence)
      for (const cause of causes) if ((cause.status === 'likely' || cause.status === 'active') && cause.id !== 'traffic') lines.push(cause.evidence)
      const app = view.metrics.appCpu.value
      const db = view.metrics.dbCpu.value
      if (app !== null && db !== null && Math.abs(db - app) >= 0.25 && Math.max(app, db) >= 0.85) {
        lines.push(
          db > app
            ? `${databaseName(view)} is showing much higher utilization (${pct(db)}) than the application tier (${pct(app)}). That makes database saturation a plausible contributor, not a proven cause.`
            : `The application tier is showing much higher utilization (${pct(app)}) than ${databaseName(view)} (${pct(db)}). That makes application capacity a plausible contributor, not a proven cause.`,
        )
      }
      const unknown = causes.filter((cause) => cause.status === 'unknown')
      if (unknown.length > 0) lines.push(`Still unknown: ${unknown.map((cause) => cause.label.toLowerCase()).join(', ')}. The cause could be there.`)
      return lines
    }
    case 'throttled':
      return live > 0.0005 && view.metrics.traffic.value !== null ? [`Traffic is ${rps(view.metrics.traffic.value)} and your rate limit only admits part of it.`] : []
    case 'appCpu':
    case 'dbCpu': {
      if (traffic) lines.push(traffic.evidence)
      const cause = of(key === 'appCpu' ? 'application' : 'database')
      if (cause) lines.push(cause.evidence)
      return lines
    }
    case 'traffic':
      return traffic ? [traffic.evidence] : []
    case 'cacheHit':
      return live < 0.5 ? ['A new cache starts empty. Its hit rate climbs as popular data is loaded into it.'] : []
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export interface DecisionExplanation extends DecisionGuide {
  /** What the operator can currently see about the causes this action is aimed at. */
  evidence: { label: string; status: HypothesisStatus; text: string }[]
}

/** What an action is for. Actions a guide does not know fall back to the engine's own description. */
export function decisionGuide(action: Pick<ActionView, 'id' | 'kind' | 'description'>, scenarioId: string): DecisionGuide {
  return guideFor(scenarioId).decisions[action.id] ?? { group: action.kind === 'investigate' ? 'investigate' : 'optimize', goal: action.description }
}

/**
 * An action, explained: its goal, when it tends to help and when it does not,
 * what it might move and in which direction, the trade-offs, and the evidence
 * on screen about what it is aimed at. Never whether to take it.
 */
export function explainDecision(action: ActionView, view: IncidentView, causes: Hypothesis[] = hypotheses(view)): DecisionExplanation {
  const guide = decisionGuide(action, view.scenarioId)
  const evidence = (guide.addresses ?? []).flatMap((id) => {
    const cause = causes.find((candidate) => candidate.id === id)
    return cause ? [{ label: cause.label, status: cause.status, text: cause.evidence }] : []
  })
  return { ...guide, evidence }
}

export function groupActions<T extends Pick<ActionView, 'id' | 'kind' | 'description'>>(actions: T[], scenarioId: string): { group: (typeof GROUPS)[number]; actions: T[] }[] {
  return GROUPS.map((group) => ({ group, actions: actions.filter((action) => decisionGuide(action, scenarioId).group === group.id) })).filter((entry) => entry.actions.length > 0)
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/** What a learned fact means for the incident, when the scenario guide says. */
export function interpretFact(fact: Pick<KnownFact, 'id' | 'value'>, view: IncidentView): string | null {
  const guide = guideFor(view.scenarioId).factGuides[fact.id]
  return guide?.interpret && typeof fact.value === 'number' ? guide.interpret(fact.value, view) : null
}

/** Before a fact is learned: what you don't know, in plain words. */
export function unknownNote(factId: string, view: IncidentView): string | null {
  return guideFor(view.scenarioId).factGuides[factId]?.unknown ?? null
}
