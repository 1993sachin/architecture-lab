/**
 * The Incident Runner adapter.
 *
 *   React UI → IncidentSession (this file) → Architecture Lab Engine → scenario
 *
 * The engine is the source of truth: it holds the system, applies decisions,
 * moves time and scores the run. This adapter only drives it and turns its
 * state into view models the UI can render. It knows nothing about how any
 * component behaves, and it never shows the user something the engine says
 * they cannot observe yet.
 */
import {
  createScenario,
  createSimulation,
  replay,
  trafficIncidentScenario,
  type ArchitectureSnapshot,
  type Constraint,
  type DecisionDefinition,
  type FiredEvent,
  type MetricId,
  type ObservedValue,
  type Scenario,
  type Simulation,
  type SimulationAction,
  type SystemState,
} from '@architecture-lab/engine'
import { clock, usd } from './format'

/** The one scenario this UI runs. Created once; scenarios are frozen and shareable. */
export const SCENARIO: Scenario = createScenario(trafficIncidentScenario)

/**
 * Pacing rule of the runner: a change to the system takes the team a minute,
 * during which the incident moves on. Investigations take the time the
 * scenario gives them. Recorded as ordinary engine actions, so replays match.
 */
export const DECISION_MINUTES = 1

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral'

export type MetricKey = 'traffic' | 'p99' | 'errors' | 'throttled' | 'availability' | 'appCpu' | 'dbCpu' | 'cacheHit' | 'queue' | 'cost'

export interface MetricView {
  key: MetricKey
  label: string
  /** `null` while the operator cannot observe it (or it does not exist yet). */
  value: number | null
  known: boolean
  /** Observable, but the component it measures does not exist (no cache yet). */
  absent: boolean
  /** Shown instead of a value when unknown, e.g. "Investigate the database". */
  hint?: string
  series: number[]
  tone: Tone
  unit: 'rps' | 'ms' | 'ratio' | 'usd' | 'messages'
  secondary?: { label: string; value: number; unit: 'ms' }
}

export interface ActionView {
  id: string
  title: string
  description: string
  kind: 'investigate' | 'change'
  enabled: boolean
  /** Why it cannot be taken right now (budget, team capacity...). */
  reason?: string
  monthlyCost: number
  complexity: number
  minutes: number
  risks: string[]
  reveals: string[]
  timesTaken: number
}

export interface KnownFact {
  id: string
  label: string
  text: string
  value: ObservedValue['value']
  description?: string
  learnedAt: number
  learnedBy: string
}

export interface UnknownFact {
  id: string
  label: string
  revealedBy: string[]
}

export interface TopologyNode {
  id: string
  label: string
  type: string
  instances: number
  health: string
  /** Utilization when the operator can see it, else `null`. */
  utilization: number | null
  isNew: boolean
}

export interface TopologyView {
  rows: TopologyNode[][]
  edges: { from: string; to: string; traffic: string }[]
}

export interface BudgetView {
  limit: number | null
  monthlyCost: number
  headroom: number | null
  over: boolean
}

export type IncidentStatus = 'quiet' | 'active' | 'holding' | 'ended'

export interface TimelineEntry {
  time: number
  kind: 'event' | 'decision' | 'consequence' | 'rejected' | 'constraint' | 'learned' | 'slo-breach' | 'slo-met'
  title: string
  detail?: string
}

export interface SloView {
  id: string
  /** Which tile it judges. */
  metric: MetricKey
  bound: 'max' | 'min'
  limit: number
  breached: boolean
}

export interface IncidentView {
  time: number
  maxTime: number
  complete: boolean
  status: IncidentStatus
  sloBreaches: string[]
  /** The SLOs as numbers, the same ones the briefing shows. */
  slos: SloView[]
  incidentStartedAt: number | null
  metrics: Record<MetricKey, MetricView>
  budget: BudgetView
  complexity: { score: number; limit: number | null }
  incidentSpend: number
  known: KnownFact[]
  unknown: UnknownFact[]
  actions: ActionView[]
  topology: TopologyView
  timeline: TimelineEntry[]
  decisionsTaken: number
}

export interface ConstraintChange {
  constraintId: string
  kind: Constraint['kind']
  description: string
  change: 'added' | 'updated' | 'removed'
  before: number | null
  after: number | null
  time: number
  cause?: FiredEvent
  monthlyCost: number
}

export interface MetricDelta {
  key: MetricKey
  label: string
  unit: MetricView['unit']
  before: number | null
  after: number | null
  better: boolean | null
}

export interface Transition {
  from: number
  to: number
  /** What the operator did, or `null` when they let time pass. */
  decision: { id: string; title: string; rationale: string; kind: ActionView['kind'] } | null
  deltas: MetricDelta[]
  events: FiredEvent[]
  revealed: ObservedValue[]
  /** Effects of earlier decisions that landed during this transition. */
  delayed: TimelineEntry[]
  constraintChanges: ConstraintChange[]
  complete: boolean
  /** For a wait: the minutes asked for (it can stop early). */
  requested?: number
  /** The opening transition: the shift began and ran until the operator was paged. */
  start?: true
  /** What the operator could see before and after, for explaining the change. */
  before: IncidentView
  after: IncidentView
}

export type DecideResult = { status: 'applied'; transition: Transition } | { status: 'rejected'; reason: string }

// ---------------------------------------------------------------------------
// Metric catalogue: which engine metric backs each tile, and which visible
// observations make it knowable. Presentation only.
// ---------------------------------------------------------------------------

interface MetricSpec {
  key: MetricKey
  label: string
  metric: MetricId
  /** Engine metrics the operator must be able to observe for this tile to show. */
  requires: MetricId[]
  unit: MetricView['unit']
  higherIsBetter: boolean
}

const METRICS: MetricSpec[] = [
  { key: 'traffic', label: 'Traffic', metric: 'requestsPerSecond', requires: ['requestsPerSecond'], unit: 'rps', higherIsBetter: false },
  { key: 'appCpu', label: 'App CPU', metric: 'cpuUtilization', requires: ['cpuUtilization'], unit: 'ratio', higherIsBetter: false },
  { key: 'dbCpu', label: 'Database CPU', metric: 'databaseUtilization', requires: ['databaseUtilization'], unit: 'ratio', higherIsBetter: false },
  { key: 'cacheHit', label: 'Cache hit rate', metric: 'cacheHitRate', requires: ['cacheHitRate'], unit: 'ratio', higherIsBetter: true },
  { key: 'queue', label: 'Write queue', metric: 'queueDepth', requires: ['queueDepth'], unit: 'messages', higherIsBetter: false },
  { key: 'p99', label: 'p99 latency', metric: 'p99Latency', requires: ['p99Latency'], unit: 'ms', higherIsBetter: false },
  { key: 'errors', label: 'Server errors', metric: 'serverErrorRate', requires: ['errorRate', 'throttleRate'], unit: 'ratio', higherIsBetter: false },
  { key: 'throttled', label: 'Throttled', metric: 'throttleRate', requires: ['throttleRate'], unit: 'ratio', higherIsBetter: false },
  { key: 'availability', label: 'Availability', metric: 'availability', requires: ['errorRate'], unit: 'ratio', higherIsBetter: true },
  { key: 'cost', label: 'Monthly cost', metric: 'monthlyCost', requires: ['monthlyCost'], unit: 'usd', higherIsBetter: false },
]

const ABSENT_HINT: Partial<Record<MetricKey, string>> = {
  cacheHit: 'No cache deployed',
  queue: 'No write queue',
}

/** Component types whose utilization a metric describes, so the diagram never shows more than the tiles. */
const UTILIZATION_METRIC: Partial<Record<string, MetricId>> = {
  application: 'cpuUtilization',
  database: 'databaseUtilization',
  databaseReplica: 'databaseUtilization',
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export class IncidentSession {
  readonly scenario: Scenario
  readonly #sim: Simulation

  constructor(scenario: Scenario = SCENARIO, simulation?: Simulation) {
    this.scenario = scenario
    this.#sim = simulation ?? createSimulation(scenario)
  }

  /** Rebuilds a session from recorded actions. Same actions, same session. */
  static fromActions(actions: readonly SimulationAction[], scenario: Scenario = SCENARIO): IncidentSession {
    return new IncidentSession(scenario, replay(scenario, actions))
  }

  get time(): number {
    return this.#sim.getTime()
  }

  get complete(): boolean {
    return this.#sim.isComplete()
  }

  /** Every action so far, in order: the input to a deterministic replay. */
  actions(): SimulationAction[] {
    return this.#sim.getHistory().actions
  }

  simulation(): Simulation {
    return this.#sim
  }

  /** Lets time run until an SLO is first breached: the moment the operator is paged. */
  startIncident(limit = this.scenario.completion.maxDuration): Transition {
    const transition = this.#transition(null, () => {
      while (!this.#sim.isComplete() && this.#sim.getTime() < limit && currentBreaches(this.#sim).length === 0) this.#sim.advance(1)
    })
    return { ...transition, start: true }
  }

  /**
   * Lets time pass, a minute at a time. Stops early when something happens
   * (an event fires, a constraint changes), so the operator is never carried
   * past news they would want to react to.
   */
  wait(minutes: number): Transition {
    const transition = this.#transition(null, () => {
      for (let minute = 0; minute < minutes && !this.#sim.isComplete(); minute++) {
        const constraints = this.#sim.getHistory().entries.filter((entry) => entry.type === 'constraint').length
        const report = this.#sim.advance(1)
        const changed = this.#sim.getHistory().entries.filter((entry) => entry.type === 'constraint').length !== constraints
        if (report.events.length > 0 || changed) break
      }
    })
    return { ...transition, requested: minutes }
  }

  /** Plays out the rest of the incident with no further decisions. */
  finish(): Transition {
    return this.#transition(null, () => {
      if (!this.#sim.isComplete()) this.#sim.runToCompletion()
    })
  }

  decide(decisionId: string, rationale: string): DecideResult {
    const text = rationale.trim()
    if (text === '') return { status: 'rejected', reason: 'Write down why you are doing this first.' }
    if (this.#sim.isComplete()) return { status: 'rejected', reason: 'The incident is over.' }
    const definition = this.#definition(decisionId)
    let rejection: string | null = null
    const transition = this.#transition(
      { id: decisionId, title: definition?.title ?? decisionId, rationale: text, kind: definition?.reveals?.length ? 'investigate' : 'change' },
      () => {
        const outcome = this.#sim.chooseDecision(decisionId, { rationale: text })
        if (outcome.status !== 'applied') {
          rejection = outcome.reason
          return
        }
        if (!definition?.duration && !this.#sim.isComplete()) this.#sim.advance(DECISION_MINUTES)
      },
    )
    return rejection === null ? { status: 'applied', transition } : { status: 'rejected', reason: rejection }
  }

  view(): IncidentView {
    return buildView(this.#sim)
  }

  #definition(decisionId: string): DecisionDefinition | undefined {
    return this.scenario.decisions.find((decision) => decision.id === decisionId)
  }

  #transition(decision: Transition['decision'], act: () => void): Transition {
    const before = buildView(this.#sim)
    const entriesBefore = this.#sim.getHistory().entries.length
    act()
    const after = buildView(this.#sim)
    const history = this.#sim.getHistory()
    const newEntries = history.entries.slice(entriesBefore)
    const events = newEntries.flatMap((entry) => (entry.type === 'event' ? [entry.event] : []))
    // Show what the operator learned as it reads now, at the end of the investigation.
    const current = new Map(this.#sim.getObservations().map((value) => [value.id, value]))
    const revealed = newEntries.flatMap((entry) => (entry.type === 'decision' ? entry.record.revealed : [])).map((value) => ({ ...value, ...current.get(value.id) }))
    return {
      from: before.time,
      to: after.time,
      decision,
      deltas: metricDeltas(before, after),
      events,
      revealed,
      delayed: after.timeline.filter((entry) => entry.kind === 'consequence' && entry.time > before.time && entry.time <= after.time),
      constraintChanges: constraintChanges(history.entries, entriesBefore, events, after.budget.monthlyCost),
      complete: after.complete,
      before,
      after,
    }
  }
}

// ---------------------------------------------------------------------------
// View building (pure functions of engine data)
// ---------------------------------------------------------------------------

function visibleMetricIds(sim: Simulation): Set<MetricId> {
  const visible = new Set(sim.getObservations().map((value) => value.id))
  const ids = new Set<MetricId>()
  for (const observation of sim.scenario.observations) {
    if (visible.has(observation.id) && observation.signal.kind === 'metric') ids.add(observation.signal.metric)
  }
  return ids
}

function metricConstraints(state: SystemState) {
  return state.constraints.filter((constraint) => constraint.kind === 'metric')
}

function currentBreaches(sim: Simulation): string[] {
  const state = sim.getState()
  const samples = sim.getHistory().samples
  const latest = samples[samples.length - 1]
  const ids = new Set(metricConstraints(state).map((constraint) => constraint.id))
  return (latest?.violations ?? []).filter((id) => ids.has(id))
}

function buildView(sim: Simulation): IncidentView {
  const state = sim.getState()
  const history = sim.getHistory()
  const scenario = sim.scenario
  const visible = visibleMetricIds(sim)
  const observations = sim.getObservations()
  const observationIds = new Set(observations.map((value) => value.id))

  const sloConstraints = metricConstraints(state)
  const breaches = currentBreaches(sim)
  const sloIds = new Set(sloConstraints.map((constraint) => constraint.id))
  const incidentStartedAt = history.samples.find((sample) => sample.violations.some((id) => sloIds.has(id)))?.time ?? null
  const complete = sim.isComplete()
  const status: IncidentStatus = complete ? 'ended' : breaches.length > 0 ? 'active' : incidentStartedAt === null ? 'quiet' : 'holding'

  const budgetConstraint = state.constraints.find((constraint) => constraint.kind === 'budget')
  const budgetLimit = budgetConstraint && 'limit' in budgetConstraint ? budgetConstraint.limit : null
  const monthlyCost = state.metrics.monthlyCost ?? 0
  const complexityConstraint = state.constraints.find((constraint) => constraint.kind === 'complexity')

  const metrics = {} as Record<MetricKey, MetricView>
  for (const spec of METRICS) {
    const known = spec.requires.every((id) => visible.has(id))
    const raw = state.metrics[spec.metric]
    const exists = raw !== undefined
    const value = known && exists ? raw : null
    const view: MetricView = {
      key: spec.key,
      label: spec.label,
      value,
      known: known && exists,
      absent: known && !exists,
      series: known ? history.samples.map((sample) => (spec.metric === 'monthlyCost' ? sample.monthlyCost : (sample.metrics[spec.metric] ?? 0))) : [],
      tone: value === null ? 'neutral' : toneFor(spec, value, state, budgetLimit),
      unit: spec.unit,
    }
    if (!known) view.hint = unknownHint(scenario, spec.metric, observationIds)
    else if (!exists) view.hint = ABSENT_HINT[spec.key] ?? 'Not available'
    if (spec.key === 'p99' && known && state.metrics.p95Latency !== undefined) view.secondary = { label: 'p95', value: state.metrics.p95Latency, unit: 'ms' }
    metrics[spec.key] = view
  }

  const known: KnownFact[] = []
  for (const record of history.decisions) {
    const duration = scenario.decisions.find((decision) => decision.id === record.decisionId)?.duration ?? 0
    for (const value of record.revealed) {
      const current = observations.find((observation) => observation.id === value.id)
      known.push({
        id: value.id,
        label: value.label,
        text: (current ?? value).text,
        value: (current ?? value).value,
        description: value.description,
        learnedAt: record.timestamp + duration,
        learnedBy: record.title,
      })
    }
  }
  const unknown: UnknownFact[] = scenario.observations
    .filter((observation) => !observationIds.has(observation.id))
    .map((observation) => ({
      id: observation.id,
      label: observation.label,
      revealedBy: scenario.decisions.filter((decision) => decision.reveals?.includes(observation.id)).map((decision) => decision.title),
    }))

  const taken = new Map<string, number>()
  for (const record of history.decisions) taken.set(record.decisionId, (taken.get(record.decisionId) ?? 0) + 1)
  const actions: ActionView[] = complete
    ? []
    : sim.getDecisions().flatMap(({ decision, validation }) => {
        // Progressive disclosure: decisions that do not apply right now (already done,
        // nothing to undo, prerequisites unmet) stay out of the way.
        if (validation.status === 'invalid') return []
        const preview = validation.status === 'valid' ? validation.preview : validation.preview
        return [
          {
            id: decision.id,
            title: decision.title,
            description: decision.description,
            kind: decision.reveals?.length ? ('investigate' as const) : ('change' as const),
            enabled: validation.status === 'valid',
            reason: validation.status === 'unavailable' ? validation.reason : undefined,
            monthlyCost: preview ? round2(preview.costDelta.monthly) : 0,
            complexity: preview ? preview.complexityDelta : decision.complexityImpact,
            minutes: decision.duration ?? DECISION_MINUTES,
            risks: [...(decision.ongoingEffects ?? []).map((effect) => effect.description), ...(decision.sideEffects ?? []).map((effect) => effect.description)],
            reveals: (decision.reveals ?? []).map((id) => scenario.observations.find((observation) => observation.id === id)?.label ?? id),
            timesTaken: taken.get(decision.id) ?? 0,
          },
        ]
      })

  return {
    time: state.time,
    maxTime: scenario.completion.maxDuration,
    complete,
    status,
    sloBreaches: breaches.map((id) => sloConstraints.find((constraint) => constraint.id === id)?.description ?? id),
    slos: sloConstraints.flatMap((constraint) => {
      const spec = constraint.kind === 'metric' ? METRICS.find((candidate) => candidate.metric === constraint.metric) : undefined
      return constraint.kind === 'metric' && spec ? [{ id: constraint.id, metric: spec.key, bound: constraint.bound, limit: constraint.limit, breached: breaches.includes(constraint.id) }] : []
    }),
    incidentStartedAt,
    metrics,
    budget: {
      limit: budgetLimit,
      monthlyCost,
      headroom: budgetLimit === null ? null : round2(budgetLimit - monthlyCost),
      over: budgetLimit !== null && monthlyCost > budgetLimit,
    },
    complexity: { score: state.complexityScore, limit: complexityConstraint && 'limit' in complexityConstraint ? complexityConstraint.limit : null },
    incidentSpend: sim.getResult().metrics.spend,
    known,
    unknown,
    actions,
    topology: topology(scenario, state, visible),
    timeline: timeline(sim),
    decisionsTaken: history.decisions.length,
  }
}

function toneFor(spec: MetricSpec, value: number, state: SystemState, budgetLimit: number | null): Tone {
  // SLO-backed metrics use the scenario's own limits.
  const slo = metricConstraints(state).find((constraint) => constraint.kind === 'metric' && constraint.metric === spec.metric)
  if (slo && slo.kind === 'metric') {
    const breached = slo.bound === 'max' ? value > slo.limit : value < slo.limit
    if (breached) return 'bad'
    const close = slo.bound === 'max' ? value > slo.limit * 0.8 : value < slo.limit + (1 - slo.limit) * 0.5
    return close ? 'warn' : 'ok'
  }
  switch (spec.unit) {
    case 'ratio':
      if (spec.key === 'cacheHit') return value >= 0.7 ? 'ok' : value >= 0.4 ? 'warn' : 'bad'
      if (spec.key === 'errors') return value > 0.02 ? 'bad' : value > 0.005 ? 'warn' : 'ok'
      if (spec.key === 'throttled') return value > 0.05 ? 'bad' : value > 0 ? 'warn' : 'ok'
      return value > 1 ? 'bad' : value > 0.85 ? 'warn' : 'ok'
    case 'usd':
      if (budgetLimit === null) return 'neutral'
      return value > budgetLimit ? 'bad' : value > budgetLimit * 0.9 ? 'warn' : 'ok'
    case 'messages':
      return value > 0 ? 'warn' : 'ok'
    default:
      return 'neutral'
  }
}

function unknownHint(scenario: Scenario, metric: MetricId, visible: Set<string>): string | undefined {
  const hidden = scenario.observations.find(
    (observation) => !visible.has(observation.id) && observation.signal.kind === 'metric' && observation.signal.metric === metric,
  )
  if (!hidden) return undefined
  const decision = scenario.decisions.find((candidate) => candidate.reveals?.includes(hidden.id))
  return decision ? `Unknown: ${decision.title.toLowerCase()} to find out` : 'Unknown'
}

interface TopologyInput {
  components: Pick<ArchitectureSnapshot['components'][number], 'id' | 'label' | 'type' | 'instances' | 'health' | 'utilization'>[]
  dependencies: ArchitectureSnapshot['dependencies']
}

/** The system diagram from a postmortem snapshot; the incident is over, so every load is shown. */
export function snapshotTopology(scenario: Scenario, snapshot: ArchitectureSnapshot): TopologyView {
  return topology(scenario, snapshot, 'all')
}

function topology(scenario: Scenario, state: TopologyInput, visible: Set<MetricId> | 'all'): TopologyView {
  const initial = new Set(scenario.initialState.components.map((component) => component.id))
  const depth = new Map<string, number>()
  for (const component of state.components) {
    const parents = state.dependencies.filter((dependency) => dependency.to === component.id).map((dependency) => depth.get(dependency.from) ?? 0)
    depth.set(component.id, parents.length === 0 ? 0 : Math.max(...parents) + 1)
  }
  // Components are listed callers-first by the engine; recompute once more for late additions.
  for (let pass = 0; pass < state.components.length; pass++) {
    for (const dependency of state.dependencies) {
      const next = (depth.get(dependency.from) ?? 0) + 1
      if (next > (depth.get(dependency.to) ?? 0)) depth.set(dependency.to, next)
    }
  }
  const rows: TopologyNode[][] = []
  for (const component of state.components) {
    const row = depth.get(component.id) ?? 0
    const metric = UTILIZATION_METRIC[component.type]
    ;(rows[row] ??= []).push({
      id: component.id,
      label: component.label,
      type: component.type,
      instances: component.instances,
      health: component.health,
      utilization: visible === 'all' ? (component.type === 'client' ? null : component.utilization) : metric && visible.has(metric) ? component.utilization : null,
      isNew: !initial.has(component.id),
    })
  }
  const seen = new Set<string>()
  const edges = state.dependencies.flatMap((dependency) => {
    const key = `${dependency.from}->${dependency.to}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ from: dependency.from, to: dependency.to, traffic: dependency.traffic }]
  })
  return { rows: rows.filter(Boolean), edges }
}

function timeline(sim: Simulation): TimelineEntry[] {
  const history = sim.getHistory()
  const now = sim.getTime()
  const entries: TimelineEntry[] = []
  for (const entry of history.entries) {
    switch (entry.type) {
      case 'event':
        entries.push({ time: entry.time, kind: 'event', title: entry.event.title, detail: entry.event.description })
        break
      case 'decision': {
        const definition = sim.scenario.decisions.find((decision) => decision.id === entry.record.decisionId)
        entries.push({ time: entry.time, kind: 'decision', title: entry.record.title, detail: entry.record.rationale })
        for (const value of entry.record.revealed) entries.push({ time: entry.time + (definition?.duration ?? 0), kind: 'learned', title: `Learned: ${value.label}` })
        // Delayed consequences: an ongoing effect first lands one interval after the decision.
        for (const effect of definition?.ongoingEffects ?? []) {
          const at = entry.time + (definition?.duration ?? 0) + (effect.interval ?? 1)
          if (at <= now) entries.push({ time: at, kind: 'consequence', title: effect.description, detail: `Delayed effect of “${entry.record.title}” (${clock(entry.time)})` })
        }
        break
      }
      case 'rejectedDecision':
        entries.push({ time: entry.time, kind: 'rejected', title: `Could not ${titleOf(sim.scenario, entry.decisionId).toLowerCase()}`, detail: entry.reasons.join(' ') })
        break
      case 'constraint': {
        if (entry.time === 0) break
        const name = CONSTRAINT_NAMES[entry.constraint.kind] ?? entry.constraint.id
        const limit = 'limit' in entry.constraint ? entry.constraint.limit : null
        const shown = limit === null ? '' : entry.constraint.kind === 'budget' ? usd(limit) + '/month' : String(limit)
        entries.push({
          time: entry.time,
          kind: 'constraint',
          title: entry.change === 'removed' ? `${name} lifted` : `New constraint: ${name.toLowerCase()} ${shown}`.trim(),
          detail: entry.constraint.description,
        })
        break
      }
      default:
        break
    }
  }
  // SLO breaches and recoveries, from the minute-by-minute samples.
  const sloIds = new Set(metricConstraints(sim.getState()).map((constraint) => constraint.id))
  let breached = false
  for (const sample of history.samples) {
    const now = sample.violations.some((id) => sloIds.has(id))
    if (now && !breached) entries.push({ time: sample.time, kind: 'slo-breach', title: 'SLO breached' })
    if (!now && breached) entries.push({ time: sample.time, kind: 'slo-met', title: 'SLOs met again' })
    breached = now
  }
  return entries.sort((a, b) => a.time - b.time || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}

/** Within one minute: what happened to you, then what it caused, then what you did about it. */
const KIND_ORDER: Record<TimelineEntry['kind'], number> = {
  event: 0,
  constraint: 1,
  'slo-breach': 2,
  'slo-met': 2,
  consequence: 3,
  learned: 4,
  decision: 5,
  rejected: 6,
}

const CONSTRAINT_NAMES: Partial<Record<Constraint['kind'], string>> = {
  budget: 'Budget',
  complexity: 'Complexity limit',
  metric: 'SLO',
}

function titleOf(scenario: Scenario, decisionId: string): string {
  return scenario.decisions.find((decision) => decision.id === decisionId)?.title ?? decisionId
}

function metricDeltas(before: IncidentView, after: IncidentView): MetricDelta[] {
  const deltas: MetricDelta[] = []
  for (const spec of METRICS) {
    const a = before.metrics[spec.key]
    const b = after.metrics[spec.key]
    if (!b.known) continue
    const changed = a.value === null || Math.abs((b.value ?? 0) - a.value) > significance(spec, a.value)
    if (!changed) continue
    const better = a.value === null || b.value === null ? null : spec.higherIsBetter ? b.value > a.value : b.value < a.value
    deltas.push({ key: spec.key, label: spec.label, unit: spec.unit, before: a.known ? a.value : null, after: b.value, better })
  }
  return deltas
}

function significance(spec: MetricSpec, base: number): number {
  switch (spec.unit) {
    case 'ratio':
      return 0.005
    case 'ms':
      return Math.max(5, base * 0.03)
    case 'rps':
      return 100
    case 'usd':
      return 1
    case 'messages':
      return 1
  }
}

function constraintChanges(
  entries: ReturnType<Simulation['getHistory']>['entries'],
  from: number,
  events: FiredEvent[],
  monthlyCost: number,
): ConstraintChange[] {
  const changes: ConstraintChange[] = []
  for (let index = from; index < entries.length; index++) {
    const entry = entries[index]
    if (entry?.type !== 'constraint' || entry.time === 0) continue
    let previous: Constraint | undefined
    for (let earlier = index - 1; earlier >= 0; earlier--) {
      const candidate = entries[earlier]
      if (candidate?.type === 'constraint' && candidate.constraint.id === entry.constraint.id) {
        previous = candidate.constraint
        break
      }
    }
    changes.push({
      constraintId: entry.constraint.id,
      kind: entry.constraint.kind,
      description: entry.constraint.description,
      change: entry.change,
      before: previous && 'limit' in previous ? previous.limit : null,
      after: entry.change !== 'removed' && 'limit' in entry.constraint ? entry.constraint.limit : null,
      time: entry.time,
      cause: events.find((event) => event.time === entry.time),
      monthlyCost,
    })
  }
  return changes
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
