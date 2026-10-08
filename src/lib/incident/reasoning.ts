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

function node(view: IncidentView, id: string) {
  return view.topology.rows.flat().find((candidate) => candidate.id === id)
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

  const dbNode = node(view, 'db')
  if (dbNode) {
    const reads = fact(view, 'read-ratio')
    const cacheable = fact(view, 'cacheable-reads')
    const extra =
      (typeof reads?.value === 'number' ? ` Reads are ${pct(reads.value)} of traffic` : '') +
      (typeof reads?.value === 'number' && typeof cacheable?.value === 'number' ? `, and ${pct(cacheable.value)} of reads are cacheable.` : typeof reads?.value === 'number' ? '.' : '')
    if (db === null) {
      const action = revealer(view, 'database-cpu')
      const clue =
        struggling && app !== null && load(app) === 'room'
          ? ' Requests are slow or failing while the application has room, so something it depends on could be struggling.'
          : ''
      list.push({
        id: 'database',
        label: 'Database saturation',
        status: 'unknown',
        evidence: `PostgreSQL load is unknown.${clue}${extra}`,
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
            ? `PostgreSQL CPU is ${pct(db)}: evidence suggests the database is a bottleneck.${extra}`
            : level === 'near'
              ? `PostgreSQL CPU is ${pct(db)}: close to its limit.${extra}`
              : masked
                ? `PostgreSQL CPU is ${pct(db)}, but the application fails many requests before they reach it. The database could get busier once the application recovers.`
                : `PostgreSQL CPU is ${pct(db)}: it has room right now.`,
      })
    }
    if (dbNode.health !== 'healthy') {
      list.push({ id: 'failover', label: 'Database failover', status: 'active', evidence: `PostgreSQL is ${dbNode.health} and runs with less capacity until the failover completes.` })
    }
  }

  if (hit !== null && hit < 0.5) {
    list.push({ id: 'cache', label: 'Cold cache', status: 'possible', evidence: `Redis answers ${pct(hit)} of reads; the rest still go to PostgreSQL.` })
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
  if (db === null && node(view, 'db')) lines.push('Database load is unknown.')
  else if (db !== null) lines.push(`PostgreSQL CPU is ${pct(db)}.`)
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
// Why is this happening?
// ---------------------------------------------------------------------------

export interface ChainStep {
  label: string
  value: string
  tone: 'up' | 'down' | 'unknown' | 'plain'
}

export interface SymptomExplanation {
  title: string
  lines: string[]
  /** Symptoms are downstream of load: traffic → components → latency and errors → availability. */
  chain: ChainStep[]
  /** What the visible evidence ties the failures to, if anything. */
  associated: string[]
  remedies: string[]
}

const REMEDIES = ['Relieve the bottleneck', 'Add capacity where it is missing', 'Reduce the load coming in', 'Move work out of the synchronous path']

export function explainSymptom(view: IncidentView, causes = hypotheses(view)): SymptomExplanation | null {
  const availability = value(view, 'availability')
  const errors = value(view, 'errors') ?? 0
  const throttled = value(view, 'throttled') ?? 0
  const p99 = value(view, 'p99')
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
  if (associated.length === 0) {
    associated.push(
      unknown.length > 0
        ? `You can’t yet see which component is struggling: ${unknown.map((cause) => cause.label.toLowerCase()).join(' and ')} ${unknown.length > 1 ? 'are' : 'is'} unknown.`
        : 'No component you can see is past its capacity.',
    )
  }

  const traffic = value(view, 'traffic')
  const app = value(view, 'appCpu')
  const db = value(view, 'dbCpu')
  const loadValue = [app === null ? null : `app ${pct(app)}`, node(view, 'db') ? (db === null ? 'database ?' : `database ${pct(db)}`) : null].filter(Boolean).join(' · ')
  const chain: ChainStep[] = [
    { label: 'Traffic', value: traffic === null ? '?' : rps(traffic), tone: 'up' },
    { label: 'Load on each component', value: loadValue, tone: db === null && node(view, 'db') ? 'unknown' : 'up' },
    { label: 'A bottleneck', value: evidence.length > 0 ? evidence.map((cause) => cause.label.toLowerCase()).join(', ') : 'not identified yet', tone: evidence.length > 0 ? 'plain' : 'unknown' },
    { label: 'Latency and errors', value: [p99 === null ? null : `p99 ${ms(p99)}`, `errors ${pct(errors)}`].filter(Boolean).join(' · '), tone: 'up' },
    { label: 'Availability', value: availability === null ? '?' : percent(availability), tone: 'down' },
  ]
  return { title, lines, chain, associated, remedies: REMEDIES }
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
  const status = (id: Hypothesis['id']) => causes.find((cause) => cause.id === id)?.status
  const breaches = view.slos.filter((candidate) => candidate.breached).map((candidate) => (candidate.metric === 'p99' ? 'p99 latency' : 'availability'))
  const breaching = breaches.length > 0 ? `${capitalize(breaches.join(' and '))} ${breaches.length > 1 ? 'are' : 'is'} breaching.` : ''
  const app = value(view, 'appCpu')
  const appWords = app === null ? '' : load(app) === 'room' ? `Application CPU is moderate (${pct(app)})` : load(app) === 'near' ? `The application is close to its limit (${pct(app)})` : `The application is over capacity (${pct(app)})`
  const rising = status('traffic') === 'active'

  if (status('failover') === 'active') {
    return { framing: `${breaching} PostgreSQL is failing over and has less capacity until it finishes.`.trim(), question: 'Do you wait it out, or protect the system in the meantime?' }
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
  if (appLikely && dbLikely) return framed({ framing: `${breaching} Both the application and PostgreSQL are past their capacity.`, question: 'Which bottleneck do you relieve first, and what will the other one do?' })
  if (dbLikely) return framed({ framing: `${breaching} PostgreSQL is past its capacity while the application ${app !== null && load(app) === 'room' ? 'has room' : 'is also busy'}.`, question: 'How will you relieve the pressure on the database?' })
  if (appLikely && dbUnknown) return framed({ framing: `${breaching} ${appWords}. Database load is unknown.`, question: rising ? 'Traffic is still climbing. Do you investigate further, add capacity, or protect the system?' : 'Do you add capacity, reduce the load, or find out more first?' })
  if (appLikely) return framed({ framing: `${breaching} ${appWords}.`, question: 'How will you take pressure off the application?' })
  if (dbUnknown) return framed({ framing: `${breaching} ${appWords ? `${appWords}, but database load is unknown.` : 'Database load is unknown.'}`, question: 'What do you want to learn or change?' })
  return framed({ framing: `${breaching} ${appWords ? `${appWords}.` : ''}`.trim(), question: rising ? 'Do you investigate further, add capacity, or protect the system?' : 'What do you want to learn or change?' })
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
  improved: MetricDelta[]
  worsened: MetricDelta[]
  /** Why the visible numbers moved the way they did, given what the operator did. */
  why: string[]
  /** What moved on its own while the operator acted. */
  meanwhile: string[]
  /** How the picture of possible causes changed. */
  changes: HypothesisChange[]
}

const IMPACT: MetricKey[] = ['availability', 'p99', 'errors', 'throttled']

export function explainTransition(transition: Transition): ConsequenceExplanation {
  const { before, after, deltas, decision } = transition
  const delta = (key: MetricKey) => deltas.find((candidate) => candidate.key === key)
  const judged = deltas.filter((candidate) => candidate.key !== 'traffic' && candidate.key !== 'cost')
  const improved = judged.filter((candidate) => candidate.better === true)
  const worsened = judged.filter((candidate) => candidate.better === false)
  const impactBetter = IMPACT.some((key) => delta(key)?.better === true)
  const impactWorse = IMPACT.some((key) => delta(key)?.better === false)
  const why: string[] = []
  const show = (key: MetricKey) => {
    const d = delta(key)
    return d && d.before !== null && d.after !== null ? `${metricValue(d.unit, d.before)} → ${metricValue(d.unit, d.after)}` : null
  }
  const dbUnknown = value(after, 'dbCpu') === null && node(after, 'db') !== undefined
  const dbMove = () => {
    const d = delta('dbCpu')
    if (dbUnknown) return 'PostgreSQL load is unknown, so watch errors and latency to judge the effect.'
    if (!d || d.before === null) return null
    return d.better ? `PostgreSQL CPU ${show('dbCpu')}: less work reaches the database.` : `PostgreSQL CPU ${show('dbCpu')}: the database is doing more work.`
  }

  switch (decision?.id) {
    case 'scale-application': {
      const app = delta('appCpu')
      if (app?.better) why.push(`The new instances share the work: application CPU ${show('appCpu')}.`)
      if (!impactBetter) why.push('Errors and latency did not improve, so the application was probably not the only limit.')
      const db = delta('dbCpu')
      if (db && db.better === false && db.before !== null) why.push(`PostgreSQL CPU ${show('dbCpu')}: the application now passes more requests to the database. Fixing one bottleneck can expose another.`)
      else if (dbUnknown && !impactBetter) why.push('Database load is unknown, so you can’t see where the extra work went.')
      break
    }
    case 'enable-cache': {
      const hit = value(after, 'cacheHit')
      if (hit !== null) why.push(`Redis now answers ${pct(hit)} of reads; the rest still go to PostgreSQL. It warms up over the next few minutes.`)
      const line = dbMove()
      if (line) why.push(line)
      break
    }
    case 'add-database-replica': {
      why.push('Half of the database reads now go to the replica. Writes still go to the primary.')
      const line = dbMove()
      if (line) why.push(line)
      break
    }
    case 'upgrade-database':
    case 'downgrade-database': {
      if (node(after, 'db')?.health !== 'healthy') why.push('PostgreSQL is failing over and runs degraded until it completes, so things can get worse before they get better.')
      break
    }
    case 'enable-rate-limiting':
    case 'tighten-rate-limit':
    case 'relax-rate-limit': {
      const throttled = value(after, 'throttled')
      if (throttled !== null) why.push(`The gateway now turns away ${pct(throttled)} of requests. Those users count against availability, but everything behind the gateway gets less work.`)
      const app = delta('appCpu')
      if (app && app.before !== null) why.push(`Application CPU ${show('appCpu')}.`)
      break
    }
    case 'enable-async-writes': {
      why.push('Writes now wait in a queue and reach the database later, at a steady rate.')
      const line = dbMove()
      if (line) why.push(line)
      break
    }
    case 'scale-down-application':
    case 'remove-database-replica': {
      const cost = delta('cost')
      if (cost && cost.before !== null && cost.after !== null) why.push(`You gave back ${usd(cost.before - cost.after)}/month.`)
      const line = decision.id === 'scale-down-application' && delta('appCpu') ? `Application CPU ${show('appCpu')}: fewer instances share the work.` : dbMove()
      if (line) why.push(line)
      break
    }
    default:
      break
  }
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
  const changes: HypothesisChange[] = []
  for (const cause of hypotheses(after)) {
    const old = previous.get(cause.id)
    if (cause.id === 'traffic') continue
    // After an investigation, new evidence counts even when the verdict holds.
    const learned = decision?.kind === 'investigate' && old?.evidence !== cause.evidence
    if (!old || old.status !== cause.status || learned) changes.push({ id: cause.id, label: cause.label, from: old?.status ?? null, to: cause.status, evidence: cause.evidence })
  }
  return { improved, worsened, why, meanwhile, changes }
}

/** Sentence case, except for terms that are lowercase by convention (p99). */
function capitalize(text: string): string {
  return /^p\d/.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1)
}
