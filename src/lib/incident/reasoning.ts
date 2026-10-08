/**
 * Turns what the operator can see into words that help them reason:
 * what is happening, what might be causing it, and what the decision in
 * front of them is.
 *
 * Every function here reads an IncidentView, which the session adapter has
 * already filtered to what the engine says is observable. Nothing reaches
 * into the engine, so nothing here can reveal a hidden value. It also never
 * names a winning move: it frames evidence, and the engine decides outcomes.
 */
import { clock, metricValue, ms, percent, rps, usd } from './format'
import { guideFor, type ConsequenceContext, type DecisionGuide } from './guide'
import type { ActionView, IncidentView, MetricDelta, MetricKey, Transition } from './session'

// ---------------------------------------------------------------------------
// Reading the view
// ---------------------------------------------------------------------------

function value(view: IncidentView, key: MetricKey): number | null {
  return view.metrics[key].value
}

function fact(view: IncidentView, id: string) {
  return view.known.find((candidate) => candidate.id === id)
}

function slo(view: IncidentView, key: MetricKey) {
  return view.slos.find((candidate) => candidate.metric === key)
}

/** The metric's value `minutes` ago, from its per-minute series. */
function earlier(view: IncidentView, key: MetricKey, minutes: number): number | null {
  const series = view.metrics[key].series
  if (series.length === 0) return null
  return series[Math.max(0, series.length - 1 - minutes)] ?? null
}

/** The investigation that would reveal an unknown fact, as an action the operator can take now. */
function revealer(view: IncidentView, factId: string): ActionView | undefined {
  const unknown = view.unknown.find((candidate) => candidate.id === factId)
  return unknown ? view.actions.find((action) => unknown.revealedBy.includes(action.title)) : undefined
}

/** The primary database, found by its type so no scenario's ids are baked in. */
function database(view: IncidentView) {
  return view.topology.rows.flat().find((candidate) => candidate.type === 'database')
}

/** What the scenario calls its database, e.g. "PostgreSQL". */
export function databaseName(view: IncidentView): string {
  return database(view)?.label ?? 'The database'
}

/** How a utilization reads: past capacity, close to it, or with room to spare. */
function load(utilization: number): 'over' | 'near' | 'room' {
  return utilization >= 1 ? 'over' : utilization >= 0.85 ? 'near' : 'room'
}

const pct = (ratio: number) => percent(ratio, 0)

export type Stage = 'early' | 'middle' | 'late'

/**
 * Early on the screen explains more; once the operator has made a couple of
 * calls it gets out of the way; late in the incident it is about trade-offs.
 */
export function stage(view: IncidentView): Stage {
  if (view.decisionsTaken < 2 && view.time < 12) return 'early'
  if (view.time >= view.maxTime * 0.55 || view.budget.over) return 'late'
  return 'middle'
}

// ---------------------------------------------------------------------------
// Possible causes
// ---------------------------------------------------------------------------

/**
 * `likely`: the evidence points here. `possible`: could be. `unknown`: you
 * cannot tell yet. `unlikely`: the evidence points away. `active`: something
 * you know is happening because of a decision or event, such as a failover.
 */
export type HypothesisStatus = 'likely' | 'active' | 'possible' | 'unknown' | 'unlikely'

export interface Hypothesis {
  id: 'traffic' | 'application' | 'database' | 'failover' | 'cache' | 'throttling' | 'writes'
  label: string
  status: HypothesisStatus
  /** What the operator can see that supports this status. */
  evidence: string
  /** The investigation that would settle it, when one is available. */
  check?: { actionId: string; title: string }
}

const ORDER: Record<HypothesisStatus, number> = { likely: 0, active: 1, possible: 2, unknown: 3, unlikely: 4 }

export function hypotheses(view: IncidentView): Hypothesis[] {
  const list: Hypothesis[] = []
  const traffic = value(view, 'traffic')
  const app = value(view, 'appCpu')
  const db = value(view, 'dbCpu')
  const errors = value(view, 'errors')
  const throttled = value(view, 'throttled')
  const hit = value(view, 'cacheHit')
  const queue = value(view, 'queue')
  const struggling = view.slos.some((candidate) => candidate.breached) || (errors ?? 0) > 0.01

  if (traffic !== null) {
    const window = Math.min(3, Math.max(1, view.metrics.traffic.series.length - 1))
    const before = earlier(view, 'traffic', window) ?? traffic
    const start = view.metrics.traffic.series[0] ?? traffic
    const times = start > 0 ? traffic / start : 1
    if (traffic > before * 1.1) {
      list.push({ id: 'traffic', label: 'Rising traffic', status: 'active', evidence: `Traffic went from ${rps(before)} to ${rps(traffic)} in the last ${window} min. Every component has to absorb it.` })
    } else if (traffic < before * 0.9) {
      list.push({ id: 'traffic', label: 'Rising traffic', status: 'unlikely', evidence: `Traffic is falling (${rps(before)} → ${rps(traffic)}).` })
    } else if (times >= 2) {
      list.push({ id: 'traffic', label: 'High traffic', status: 'possible', evidence: `Traffic is steady at ${rps(traffic)}, ${Number(times.toFixed(1))}× where the shift started.` })
    }
  }

  if (app !== null) {
    const level = load(app)
    list.push({
      id: 'application',
      label: 'Application capacity',
      status: level === 'over' ? 'likely' : level === 'near' ? 'possible' : 'unlikely',
      evidence:
        level === 'over'
          ? `Application CPU is ${pct(app)}: it is receiving more work than it can handle.`
          : level === 'near'
            ? `Application CPU is ${pct(app)}: close to its limit.`
            : `Application CPU is ${pct(app)}, so the application is not obviously saturated.`,
    })
  }

  const dbNode = database(view)
  const roles = guideFor(view.scenarioId).facts
  const name = databaseName(view)
  if (dbNode) {
    const reads = roles.readShare ? fact(view, roles.readShare) : undefined
    const cacheable = roles.cacheableShare ? fact(view, roles.cacheableShare) : undefined
    const extra =
      (typeof reads?.value === 'number' ? ` Reads are ${pct(reads.value)} of traffic` : '') +
      (typeof reads?.value === 'number' && typeof cacheable?.value === 'number' ? `, and ${pct(cacheable.value)} of reads are cacheable.` : typeof reads?.value === 'number' ? '.' : '')
    if (db === null) {
      const action = roles.databaseLoad ? revealer(view, roles.databaseLoad) : undefined
      const clue =
        struggling && app !== null && load(app) === 'room'
          ? ' Requests are slow or failing while the application has room, so something it depends on could be struggling.'
          : ''
      list.push({
        id: 'database',
        label: 'Database saturation',
        status: 'unknown',
        evidence: `${name} load is unknown.${clue}${extra}`,
        check: action ? { actionId: action.id, title: action.title } : undefined,
      })
    } else {
      const level = load(db)
      const masked = level === 'room' && app !== null && load(app) === 'over'
      list.push({
        id: 'database',
        label: 'Database saturation',
        status: level === 'over' ? 'likely' : level === 'near' || masked ? 'possible' : 'unlikely',
        evidence:
          level === 'over'
            ? `${name} CPU is ${pct(db)}: evidence suggests the database is a bottleneck.${extra}`
            : level === 'near'
              ? `${name} CPU is ${pct(db)}: close to its limit.${extra}`
              : masked
                ? `${name} CPU is ${pct(db)}, but the application fails many requests before they reach it. The database could get busier once the application recovers.`
                : `${name} CPU is ${pct(db)}: it has room right now.`,
      })
    }
    if (dbNode.health !== 'healthy') {
      list.push({ id: 'failover', label: 'Database failover', status: 'active', evidence: `${name} is ${dbNode.health} and runs with less capacity until the failover completes.` })
    }
  }

  if (hit !== null && hit < 0.5) {
    list.push({ id: 'cache', label: 'Cold cache', status: 'possible', evidence: `The cache answers ${pct(hit)} of reads; the rest still go to ${name}.` })
  }
  if (throttled !== null && throttled > 0.0005) {
    list.push({ id: 'throttling', label: 'Your rate limit', status: 'active', evidence: `The gateway rejects ${pct(throttled)} of requests on purpose. They count against availability.` })
  }
  if (queue !== null && queue > 0) {
    list.push({ id: 'writes', label: 'Write backlog', status: 'active', evidence: `${metricValue('messages', queue)} writes are waiting in the queue and will reach the database later.` })
  }

  return list.sort((a, b) => ORDER[a.status] - ORDER[b.status])
}

// ---------------------------------------------------------------------------
// What's happening
// ---------------------------------------------------------------------------

export function situation(view: IncidentView, causes = hypotheses(view)): string[] {
  const lines: string[] = []
  const traffic = causes.find((cause) => cause.id === 'traffic')
  if (traffic && traffic.status !== 'unlikely') lines.push(traffic.evidence.replace(/ Every component has to absorb it\.$/, ''))
  else if (traffic) lines.push(traffic.evidence)

  const impact = impactLine(view)
  if (impact) lines.push(impact)

  const app = causes.find((cause) => cause.id === 'application')
  if (app) lines.push(app.evidence)
  const db = value(view, 'dbCpu')
  if (db === null && database(view)) lines.push('Database load is unknown.')
  else if (db !== null) lines.push(`${databaseName(view)} CPU is ${pct(db)}.`)
  for (const cause of causes) if (cause.id === 'failover' || cause.id === 'throttling') lines.push(cause.evidence)
  return lines
}

function impactLine(view: IncidentView): string | null {
  const availability = value(view, 'availability')
  const errors = value(view, 'errors') ?? 0
  const throttled = value(view, 'throttled') ?? 0
  const p99 = value(view, 'p99')
  const availabilitySlo = slo(view, 'availability')
  const latencySlo = slo(view, 'p99')
  const parts: string[] = []
  if (availability !== null && availabilitySlo?.breached) {
    const before = earlier(view, 'availability', 1)
    const falling = before !== null && availability < before - 0.005
    const why = throttled > 0.0005 ? `${pct(errors)} of requests fail and ${pct(throttled)} are rate-limited` : `${percent(errors)} of requests are failing`
    parts.push(`Availability is ${falling ? 'falling' : 'down'} to ${percent(availability)} because ${why}.`)
  }
  if (p99 !== null && latencySlo?.breached) parts.push(`p99 latency is ${ms(p99)}, over the ${ms(latencySlo.limit)} SLO.`)
  if (parts.length === 0 && availability !== null && p99 !== null) return `Both SLOs are holding: availability ${percent(availability)}, p99 ${ms(p99)}.`
  return parts.join(' ') || null
}

// ---------------------------------------------------------------------------
// How metrics connect
// ---------------------------------------------------------------------------

export interface ChainStep {
  label: string
  value?: string
  tone: 'up' | 'down' | 'unknown' | 'plain'
  /** The step the current evidence is about. */
  focus?: boolean
}

/**
 * A causal chain between metrics. Each one is shown only when the current
 * state supports it: no cache chain without a cache, no throttling chain
 * while nothing is throttled.
 */
export interface Chain {
  id: 'load' | 'cache' | 'throttling' | 'queue'
  title: string
  steps: ChainStep[]
  /** The metrics it connects, so a metric's explanation can show the chains it is part of. */
  metrics: MetricKey[]
}

export function relationships(view: IncidentView, causes = hypotheses(view)): Chain[] {
  const chains: Chain[] = []
  const traffic = value(view, 'traffic')
  const app = value(view, 'appCpu')
  const db = value(view, 'dbCpu')
  const p99 = value(view, 'p99')
  const errors = value(view, 'errors')
  const availability = value(view, 'availability')
  const throttled = value(view, 'throttled')
  const hit = value(view, 'cacheHit')
  const queue = value(view, 'queue')
  const hasDb = database(view) !== undefined
  const struggling = view.slos.some((candidate) => candidate.breached)

  if (traffic !== null) {
    const bottlenecks = causes.filter((cause) => cause.status === 'likely' && (cause.id === 'application' || cause.id === 'database'))
    const dbUnknown = hasDb && db === null
    const loadValue = [app === null ? null : `app ${pct(app)}`, hasDb ? (db === null ? 'database ?' : `database ${pct(db)}`) : null].filter(Boolean).join(' · ')
    chains.push({
      id: 'load',
      title: 'How load turns into failures',
      metrics: ['traffic', 'appCpu', 'dbCpu', 'p99', 'errors', 'availability'],
      steps: [
        { label: 'Traffic', value: rps(traffic), tone: causes.find((cause) => cause.id === 'traffic')?.status === 'active' ? 'up' : 'plain' },
        { label: 'Load on each component', value: loadValue, tone: dbUnknown ? 'unknown' : 'up', focus: struggling && bottlenecks.length === 0 && dbUnknown },
        {
          label: 'A bottleneck',
          value: bottlenecks.length > 0 ? bottlenecks.map((cause) => cause.label.toLowerCase()).join(', ') : 'not identified yet',
          tone: bottlenecks.length > 0 ? 'plain' : 'unknown',
          focus: struggling && bottlenecks.length > 0,
        },
        { label: 'Latency and errors', value: [p99 === null ? null : `p99 ${ms(p99)}`, errors === null ? null : `errors ${pct(errors)}`].filter(Boolean).join(' · '), tone: struggling ? 'up' : 'plain' },
        { label: 'Availability', value: availability === null ? '?' : percent(availability), tone: slo(view, 'availability')?.breached ? 'down' : 'plain' },
      ],
    })
  }
  if (throttled !== null && throttled > 0.0005 && traffic !== null) {
    chains.push({
      id: 'throttling',
      title: 'How your rate limit trades users for stability',
      metrics: ['throttled', 'traffic', 'appCpu', 'availability'],
      steps: [
        { label: 'Traffic arriving', value: rps(traffic), tone: 'plain' },
        { label: 'Rate limit', value: 'rejects the excess', tone: 'plain' },
        { label: 'Throttled', value: pct(throttled), tone: 'up', focus: true },
        { label: 'Accepted load', value: rps(traffic * (1 - throttled)), tone: 'down' },
        { label: 'Pressure behind the gateway', value: app === null ? undefined : `app ${pct(app)}`, tone: 'down' },
      ],
    })
  }
  if (hit !== null) {
    chains.push({
      id: 'cache',
      title: 'How the cache takes work off the database',
      metrics: ['cacheHit', 'dbCpu', 'p99'],
      steps: [
        { label: 'Cache hit rate', value: pct(hit), tone: 'plain', focus: hit < 0.5 },
        { label: 'Reads reaching the database', value: `${pct(1 - hit)} of reads`, tone: 'down' },
        { label: 'Database utilization', value: db === null ? '?' : pct(db), tone: db === null ? 'unknown' : 'down' },
        { label: 'Latency may fall', value: p99 === null ? undefined : `p99 ${ms(p99)}`, tone: 'down' },
      ],
    })
  }
  if (queue !== null) {
    chains.push({
      id: 'queue',
      title: 'How the queue defers writes',
      metrics: ['queue', 'dbCpu'],
      steps: [
        { label: 'Writes arrive', tone: 'plain' },
        { label: 'Waiting in the queue', value: metricValue('messages', queue), tone: queue > 0 ? 'up' : 'plain', focus: queue > 0 },
        { label: 'Database write load now', value: 'lower', tone: 'down' },
        { label: 'Writes applied later', value: 'delay', tone: 'plain' },
      ],
    })
  }
  return chains
}

// ---------------------------------------------------------------------------
// Why is this happening?
// ---------------------------------------------------------------------------

export interface SymptomExplanation {
  title: string
  lines: string[]
  /** The chains behind the symptom: always load → failures, plus throttling when it is in play. */
  chains: Chain[]
  /** What the visible evidence ties the failures to, if anything. */
  associated: string[]
  remedies: string[]
}

const REMEDIES = ['Removing a bottleneck', 'Adding capacity where it is missing', 'Reducing expensive work, for example by caching reads', 'Protecting the system from overload', 'Moving work out of the synchronous path']

export function explainSymptom(view: IncidentView, causes = hypotheses(view)): SymptomExplanation | null {
  const availability = value(view, 'availability')
  const errors = value(view, 'errors') ?? 0
  const throttled = value(view, 'throttled') ?? 0
  const availabilityBreached = slo(view, 'availability')?.breached ?? false
  const latencyBreached = slo(view, 'p99')?.breached ?? false
  if (!availabilityBreached && !latencyBreached) return null

  const before = earlier(view, 'availability', 1)
  const falling = availability !== null && before !== null && availability < before - 0.005
  const title = availabilityBreached ? (falling ? 'Why is availability falling?' : 'Why is availability low?') : 'Why is latency so high?'
  const lines = availabilityBreached
    ? [
        `Availability is the share of requests that succeed. Right now ${pct(errors)} fail with server errors${throttled > 0.0005 ? ` and ${pct(throttled)} are turned away by your rate limit` : ''}.`,
        'A request fails when a component it passes through gets more work than it can handle. Before that point, requests queue up and latency climbs.',
      ]
    : ['p99 is how long the slowest 1% of requests take. It climbs steeply as any component on the path nears its capacity, because requests wait in line.']

  const evidence = causes.filter((cause) => cause.status === 'likely' || cause.status === 'active').filter((cause) => cause.id !== 'traffic')
  const unknown = causes.filter((cause) => cause.status === 'unknown')
  const associated = evidence.map((cause) => cause.evidence)
  const app = value(view, 'appCpu')
  const db = value(view, 'dbCpu')
  if (app !== null && db !== null && Math.abs(db - app) >= 0.25 && Math.max(app, db) >= 0.85) {
    const [high, low] = db > app ? [`${databaseName(view)} (${pct(db)})`, `the application tier (${pct(app)})`] : [`the application tier (${pct(app)})`, `${databaseName(view)} (${pct(db)})`]
    associated.push(`${capitalize(high)} is showing much higher utilization than ${low}. That makes it a plausible contributor to the ${latencyBreached ? 'latency and ' : ''}failures, not a proven cause.`)
  }
  if (associated.length === 0) {
    associated.push(
      unknown.length > 0
        ? `You can’t yet see which component is struggling: ${unknown.map((cause) => cause.label.toLowerCase()).join(' and ')} ${unknown.length > 1 ? 'are' : 'is'} unknown.`
        : 'No component you can see is past its capacity.',
    )
  }
  const chains = relationships(view, causes).filter((chain) => chain.id === 'load' || chain.id === 'throttling')
  return { title, lines, chains, associated, remedies: REMEDIES }
}

// ---------------------------------------------------------------------------
// Your move
// ---------------------------------------------------------------------------

export interface YourMove {
  framing: string
  question: string
}

/** Frames the decision in front of the operator. Never names an action. */
export function yourMove(view: IncidentView, causes = hypotheses(view)): YourMove | null {
  if (view.complete) return null
  const name = databaseName(view)
  const status = (id: Hypothesis['id']) => causes.find((cause) => cause.id === id)?.status
  const breaches = view.slos.filter((candidate) => candidate.breached).map((candidate) => (candidate.metric === 'p99' ? 'p99 latency' : 'availability'))
  const breaching = breaches.length > 0 ? `${capitalize(breaches.join(' and '))} ${breaches.length > 1 ? 'are' : 'is'} breaching.` : ''
  const app = value(view, 'appCpu')
  const appWords = app === null ? '' : load(app) === 'room' ? `Application CPU is moderate (${pct(app)})` : load(app) === 'near' ? `The application is close to its limit (${pct(app)})` : `The application is over capacity (${pct(app)})`
  const rising = status('traffic') === 'active'

  if (status('failover') === 'active') {
    return { framing: `${breaching} ${name} is failing over and has less capacity until it finishes.`.trim(), question: 'Do you wait it out, or protect the system in the meantime?' }
  }
  if (view.budget.over && view.budget.headroom !== null) {
    const over = usd(-view.budget.headroom)
    return breaches.length > 0
      ? { framing: `${breaching} You are also ${over}/month over budget.`, question: 'Which matters more right now, and what can you give back without making it worse?' }
      : { framing: `The SLOs are holding, but you are ${over}/month over budget.`, question: 'What can you give back without breaking the SLOs?' }
  }
  const tight = view.budget.headroom !== null && view.budget.limit !== null && view.budget.headroom < view.budget.limit * 0.15
  const money = tight ? ` Only ${usd(view.budget.headroom as number)}/month of budget is left.` : ''
  const framed = (move: YourMove): YourMove => ({ ...move, framing: `${move.framing}${money}` })
  if (breaches.length === 0) {
    return framed({ framing: 'The SLOs are holding for now.', question: rising ? 'Traffic is still moving. What could break next, and are you ready for it?' : 'Is what you are running worth what it costs?' })
  }

  const appLikely = status('application') === 'likely'
  const dbLikely = status('database') === 'likely'
  const dbUnknown = status('database') === 'unknown'
  if (appLikely && dbLikely) return framed({ framing: `${breaching} Both the application and ${name} are past their capacity.`, question: 'Which bottleneck do you relieve first, and what will the other one do?' })
  if (dbLikely) return framed({ framing: `${breaching} ${name} is past its capacity while the application ${app !== null && load(app) === 'room' ? 'has room' : 'is also busy'}.`, question: 'How will you relieve the pressure on the database?' })
  if (appLikely && dbUnknown) return framed({ framing: `${breaching} ${appWords}. Database load is unknown.`, question: rising ? 'Traffic is still climbing. Do you investigate further, add capacity, or protect the system?' : 'Do you add capacity, reduce the load, or find out more first?' })
  if (appLikely) return framed({ framing: `${breaching} ${appWords}.`, question: 'How will you take pressure off the application?' })
  if (dbUnknown) return framed({ framing: `${breaching} ${appWords ? `${appWords}, but database load is unknown.` : 'Database load is unknown.'}`, question: 'What do you want to learn or change?' })
  return framed({ framing: `${breaching} ${appWords ? `${appWords}.` : ''}`.trim(), question: rising ? 'Do you investigate further, add capacity, or protect the system?' : 'What do you want to learn or change?' })
}

/**
 * What the operator can say they believe before acting. Built from the
 * causes on screen, so it never offers one the evidence has not raised.
 */
export function hypothesisOptions(causes: Hypothesis[]): { id: string; label: string }[] {
  const options = causes.filter((cause) => cause.status !== 'unlikely' && (cause.id === 'application' || cause.id === 'database' || cause.id === 'traffic' || cause.id === 'cache' || cause.id === 'writes'))
  const seen = new Set(options.map((cause) => cause.id))
  // Application and database are always worth naming, even when the evidence points away: the operator may disagree.
  for (const id of ['application', 'database'] as const) {
    const cause = causes.find((candidate) => candidate.id === id)
    if (cause && !seen.has(id)) options.push(cause)
  }
  return [...options.map((cause) => ({ id: cause.id, label: HYPOTHESIS_LABEL[cause.id] ?? cause.label })), { id: 'unsure', label: 'Not sure yet: I need more information' }]
}

const HYPOTHESIS_LABEL: Partial<Record<Hypothesis['id'], string>> = {
  application: 'Application capacity',
  database: 'Database pressure',
  traffic: 'Traffic overload',
  cache: 'A cold cache',
  writes: 'Write backlog',
}

// ---------------------------------------------------------------------------
// What just happened, and why
// ---------------------------------------------------------------------------

export interface HypothesisChange {
  id: Hypothesis['id']
  label: string
  from: HypothesisStatus | null
  to: HypothesisStatus
  evidence: string
}

export interface ConsequenceExplanation {
  /** What the decision tried to do, from the scenario guide. */
  goal?: string
  /** What starts to matter now that it is in place. */
  newRisk?: string
  improved: MetricDelta[]
  worsened: MetricDelta[]
  /** The few changes worth reading first: impact, then the rest. */
  headline: MetricDelta[]
  /** Why the visible numbers moved the way they did, given what the operator did. */
  why: string[]
  /** What moved on its own while the operator acted. */
  meanwhile: string[]
  /** How the picture of possible causes changed. */
  changes: HypothesisChange[]
  /** Where the operator's stated hypothesis stands now. Not a grade: just the evidence. */
  hypothesis?: { label: string; status: HypothesisStatus; evidence: string }
}

const IMPACT: MetricKey[] = ['availability', 'p99', 'errors', 'throttled']
const HEADLINE_ORDER: MetricKey[] = ['availability', 'p99', 'errors', 'throttled', 'dbCpu', 'appCpu', 'cacheHit', 'queue']

export function explainConsequence(transition: Transition, hypothesis?: { id: string; label: string } | null): ConsequenceExplanation {
  const { before, after, deltas, decision } = transition
  const delta = (key: MetricKey) => deltas.find((candidate) => candidate.key === key)
  const judged = deltas.filter((candidate) => candidate.key !== 'traffic' && candidate.key !== 'cost')
  const improved = judged.filter((candidate) => candidate.better === true)
  const worsened = judged.filter((candidate) => candidate.better === false)
  const impactBetter = IMPACT.some((key) => delta(key)?.better === true)
  const impactWorse = IMPACT.some((key) => delta(key)?.better === false)
  const show = (key: MetricKey) => {
    const d = delta(key)
    if (!d || d.before === null || d.after === null) return null
    // In a sentence, utilizations read better as whole percentages.
    const shown = (number: number) => (d.unit === 'ratio' && number >= 0.1 ? pct(number) : metricValue(d.unit, number))
    return `${shown(d.before)} → ${shown(d.after)}`
  }
  const name = databaseName(after)
  const databaseUnknown = value(after, 'dbCpu') === null && database(after) !== undefined
  const ctx: ConsequenceContext = {
    before,
    after,
    delta,
    show,
    value: (key) => value(after, key),
    database: name,
    databaseUnknown,
    impactBetter,
    impactWorse,
    databaseMove: () => {
      const d = delta('dbCpu')
      if (databaseUnknown) return `${name} load is unknown, so watch errors and latency to judge the effect.`
      if (!d || d.before === null) return null
      return d.better ? `${name} CPU ${show('dbCpu')}: less work reaches the database.` : `${name} CPU ${show('dbCpu')}: the database is doing more work.`
    },
  }
  const guide: DecisionGuide | undefined = decision ? guideFor(after.scenarioId).decisions[decision.id] : undefined
  const why = guide?.consequence?.(ctx) ?? []
  for (const entry of transition.delayed) why.push(`${clock(entry.time)}: ${entry.title}`)

  const meanwhile: string[] = []
  const traffic = delta('traffic')
  if (traffic && traffic.before !== null && traffic.after !== null) {
    meanwhile.push(
      decision && decision.kind === 'change'
        ? `Traffic also moved, ${show('traffic')}, so part of this change comes from the incident, not your decision.`
        : `Traffic ${show('traffic')}.`,
    )
  }
  if (decision?.kind === 'change' && !impactBetter && !impactWorse && why.length === 0) meanwhile.push('Nothing you can see moved much yet.')

  const previous = new Map(hypotheses(before).map((cause) => [cause.id, cause]))
  const now = hypotheses(after)
  const changes: HypothesisChange[] = []
  for (const cause of now) {
    const old = previous.get(cause.id)
    if (cause.id === 'traffic') continue
    // After an investigation, new evidence counts even when the verdict holds.
    const learned = decision?.kind === 'investigate' && old?.evidence !== cause.evidence
    if (!old || old.status !== cause.status || learned) changes.push({ id: cause.id, label: cause.label, from: old?.status ?? null, to: cause.status, evidence: cause.evidence })
  }

  const headline = HEADLINE_ORDER.flatMap((key) => {
    const d = judged.find((candidate) => candidate.key === key)
    return d ? [d] : []
  }).slice(0, 4)

  const believed = hypothesis && hypothesis.id !== 'unsure' ? now.find((cause) => cause.id === hypothesis.id) : undefined
  return {
    goal: decision ? guide?.goal : undefined,
    newRisk: decision?.kind === 'change' ? guide?.newRisk : undefined,
    improved,
    worsened,
    headline,
    why,
    meanwhile,
    changes,
    hypothesis: believed && hypothesis ? { label: hypothesis.label, status: believed.status, evidence: believed.evidence } : undefined,
  }
}

/** Sentence case, except for terms that are lowercase by convention (p99). */
function capitalize(text: string): string {
  return /^p\d/.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1)
}
