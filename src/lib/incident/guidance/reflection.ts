/**
 * The postmortem's reasoning review: how good the engineering judgment was,
 * not just whether the system recovered. Built from the engine's postmortem
 * (what was done, what the operator could see when they did it, and what the
 * system measured afterwards) and the scenario guide. Nothing is judged by a
 * model, and asking for help never costs anything.
 */
import type { MetricSample, Postmortem, Scenario, Simulation } from '@architecture-lab/engine'
import { clock, percent } from '../format'
import { decisionGuide } from '../explain'
import { guideFor, type DecisionGuide } from '../guide'
import type { GuidanceUse } from './context'

/** ✓ good judgment · △ worth rethinking · ○ not done this time. */
export type CheckStatus = 'good' | 'concern' | 'missed'

export interface ReasoningCheck {
  id: 'investigated-first' | 'measured-database' | 'reduced-database-work' | 'scaled-into-constraint' | 'protected' | 'adapted'
  label: string
  status: CheckStatus
}

export interface Reflection {
  success: boolean
  /** Did the SLOs hold again before the window closed? */
  recovered: boolean
  /** "You recovered the system at T+21", or that it did not recover. */
  headline: string
  checks: ReasoningCheck[]
  guidance: { total: number; items: { label: string; count: number }[]; explanations: number }
  /** The four questions: each one or two sentences, or null when there is nothing to say. */
  well: string | null
  improve: string | null
  happened: string | null
  learn: string
  /** The incident failed: invite another attempt with what was learned. */
  tryAgain: boolean
}

interface Taken {
  time: number
  title: string
  guide: DecisionGuide
  /** What the database's measured load was when the operator decided, if they had measured it. */
  databaseSeen: number | null
}

function taken(report: Postmortem, scenario: Scenario): Taken[] {
  const roles = guideFor(scenario.id).facts
  return report.decisions.map((record) => {
    const definition = scenario.decisions.find((decision) => decision.id === record.decisionId)
    const kind = definition?.reveals?.length ? ('investigate' as const) : ('change' as const)
    const seen = record.knowledge.find((value) => value.id === roles.databaseLoad)?.value
    return {
      time: record.timestamp,
      title: record.title,
      guide: decisionGuide({ id: record.decisionId, kind, description: definition?.description ?? record.title }, scenario.id),
      databaseSeen: typeof seen === 'number' ? seen : null,
    }
  })
}

const aims = (entry: Taken, cause: string) => (entry.guide.addresses ?? []).includes(cause as never)
const reducesDatabaseWork = (entry: Taken) => aims(entry, 'database') && entry.guide.group !== 'capacity' && entry.guide.group !== 'investigate'
const scalesApplication = (entry: Taken) => entry.guide.group === 'capacity' && aims(entry, 'application')

function databaseLabel(scenario: Scenario): string {
  return scenario.initialState.components.find((component) => component.type === 'database')?.label ?? 'the database'
}

type Metric = keyof MetricSample['metrics']

/** The recorded value just before a moment, and the average over the few minutes after it. */
function around(timeline: MetricSample[], time: number, metric: Metric, minutes = 3): { before: number; after: number } | null {
  const before = [...timeline].reverse().find((sample) => sample.time <= time)?.metrics[metric]
  const window = timeline.filter((sample) => sample.time > time && sample.time <= time + minutes).map((sample) => sample.metrics[metric]).filter((value): value is number => typeof value === 'number')
  if (typeof before !== 'number' || window.length === 0) return null
  return { before, after: window.reduce((sum, value) => sum + value, 0) / window.length }
}

const pct = (ratio: number) => percent(ratio, 0)
const CONSTRAINT_NAME: Record<string, string> = { budget: 'budget', complexity: 'complexity limit', metric: 'SLO' }

export function reflect(report: Postmortem, scenario: Scenario, used: GuidanceUse): Reflection {
  const decisions = taken(report, scenario)
  const roles = guideFor(scenario.id).facts
  const db = databaseLabel(scenario)
  const success = report.summary.outcome === 'success'
  const stabilizedAt = report.summary.stabilizedAt
  const recovered = stabilizedAt !== null
  const firstCapacity = decisions.find((entry) => entry.guide.group === 'capacity')
  const firstInvestigation = decisions.find((entry) => entry.guide.group === 'investigate')
  const measured = report.decisions.some((record) => record.revealed.some((value) => value.id === roles.databaseLoad))
  const firstReduction = decisions.find(reducesDatabaseWork)
  const protectedSystem = decisions.find((entry) => entry.guide.group === 'protect' && aims(entry, 'traffic'))
  // Scaling the application while the database was visibly past capacity, and nothing yet taking work off it.
  const scaledIntoConstraint = decisions.find((entry) => scalesApplication(entry) && entry.databaseSeen !== null && entry.databaseSeen >= 1 && !(firstReduction && firstReduction.time <= entry.time))
  const databaseConstrained = decisions.some((entry) => (entry.databaseSeen ?? 0) >= 1) || (report.architecture.final.components.find((component) => component.type === 'database')?.utilization ?? 0) >= 1
  const change = report.constraints.timeline.find((entry) => entry.change === 'updated' && entry.time > 0)
  const finalLimit = change && 'limit' in change.constraint ? change.constraint.limit : null

  const checks: ReasoningCheck[] = []
  if (firstCapacity)
    checks.push(
      firstInvestigation && firstInvestigation.time <= firstCapacity.time
        ? { id: 'investigated-first', label: 'Investigated before making a capacity change', status: 'good' }
        : { id: 'investigated-first', label: 'Changed capacity before investigating', status: 'missed' },
    )
  checks.push(measured ? { id: 'measured-database', label: 'Measured the database instead of guessing', status: 'good' } : { id: 'measured-database', label: 'Never measured the database', status: 'missed' })
  if (firstReduction) checks.push({ id: 'reduced-database-work', label: 'Reduced the work reaching the database', status: 'good' })
  else if (databaseConstrained) checks.push({ id: 'reduced-database-work', label: 'Did not reduce the work reaching the database', status: 'missed' })
  if (scaledIntoConstraint) checks.push({ id: 'scaled-into-constraint', label: 'Added application capacity after the database became constrained', status: 'concern' })
  if (protectedSystem) checks.push({ id: 'protected', label: 'Protected the system while fixing it', status: 'good' })
  if (change) {
    const name = CONSTRAINT_NAME[change.constraint.kind] ?? 'constraints'
    const after = decisions.some((entry) => entry.time >= change.time)
    const over = change.constraint.kind === 'budget' && finalLimit !== null && report.cost.finalMonthlyCost > finalLimit
    checks.push(
      after
        ? { id: 'adapted', label: `Adapted after the ${name} changed at ${clock(change.time)}`, status: 'good' }
        : over
          ? { id: 'adapted', label: `Stayed over the ${name} after it changed at ${clock(change.time)}`, status: 'concern' }
          : { id: 'adapted', label: `Stayed within the ${name} after it changed at ${clock(change.time)}`, status: 'good' },
    )
  }

  // What actually happened, from what the engine measured after the most telling decision.
  let happened: string | null = null
  let learn: string
  const scaled = decisions.find(scalesApplication)
  const appMove = scaled && around(report.timeline, scaled.time, 'cpuUtilization')
  const dbMove = scaled && around(report.timeline, scaled.time, 'databaseUtilization')
  const shifted = appMove && dbMove && appMove.after < appMove.before - 0.02 && dbMove.after > dbMove.before + 0.05
  const relief = firstReduction && around(report.timeline, firstReduction.time, 'databaseUtilization', 5)
  if (shifted && scaled && appMove && dbMove && !(firstReduction && firstReduction.time <= scaled.time)) {
    happened = `Adding application capacity at ${clock(scaled.time)} reduced application pressure (CPU ${pct(appMove.before)} → ${pct(appMove.after)}) but pushed more work toward ${db} (${pct(dbMove.before)} → ${pct(dbMove.after)}), making the database the limiting component.`
    learn = 'When scaling one tier increases pressure on a downstream dependency, the bottleneck may have shifted rather than disappeared.'
  } else if (firstReduction && relief && relief.after < relief.before - 0.05) {
    happened = `${firstReduction.title} at ${clock(firstReduction.time)} took work off ${db}: its utilization went from ${pct(relief.before)} to ${pct(relief.after)} on average over the next few minutes.`
    learn = 'Reducing the work that reaches a bottleneck can relieve it where adding capacity elsewhere can’t.'
  } else if (protectedSystem && recovered) {
    learn = 'Admitting less traffic on purpose keeps the healthy part of the system serving while the bottleneck is dealt with. Protection costs some users; collapse costs all of them.'
  } else if (!measured) {
    learn = 'Without measuring the database, there was no way to tell where the limit was. Investigating first turns guesses into evidence.'
  } else {
    learn = 'Several different strategies can work here, each with different trade-offs. Compare your run with the reference strategies below.'
  }

  const strengths: Record<ReasoningCheck['id'], string> = {
    'investigated-first': `You investigated before your first capacity change${firstCapacity ? ` at ${clock(firstCapacity.time)}` : ''}.`,
    'measured-database': 'You measured the database instead of guessing.',
    'reduced-database-work': `You reduced the work reaching the database (${firstReduction?.title.toLowerCase() ?? ''}).`,
    protected: 'You protected the system by admitting less traffic while you fixed it.',
    adapted: 'You adapted after the constraints changed.',
    'scaled-into-constraint': '',
  }
  const improvements: Partial<Record<ReasoningCheck['id'], string>> = {
    'scaled-into-constraint': scaledIntoConstraint ? `You increased application capacity at ${clock(scaledIntoConstraint.time)} after database pressure was already visible (${db} at ${pct(scaledIntoConstraint.databaseSeen ?? 0)}).` : undefined,
    'investigated-first': firstCapacity ? `You changed capacity at ${clock(firstCapacity.time)} before investigating where the limit was.` : undefined,
    'measured-database': 'The database’s load stayed unknown, so it was never clear where the limit was.',
    'reduced-database-work': `The database stayed under pressure, and nothing reduced the work reaching it.`,
    adapted: change ? `You stayed over the new ${CONSTRAINT_NAME[change.constraint.kind] ?? 'limit'} after ${clock(change.time)}.` : undefined,
  }
  const well = checks
    .filter((check) => check.status === 'good')
    .slice(0, 2)
    .map((check) => strengths[check.id])
    .join(' ')
  const worst = checks.find((check) => check.status === 'concern') ?? checks.find((check) => check.status === 'missed')

  const items = [
    { label: 'Hints', count: used.hints },
    { label: 'Stronger hints', count: used.strongHints },
    { label: 'Guided reasoning', count: used.rescues },
    { label: '“Help me reason”', count: used.reasoningFlows },
  ]

  return {
    success,
    recovered,
    headline: recovered
      ? `You recovered the system at ${clock(stabilizedAt as number)}.`
      : report.summary.incidentStartedAt === null
        ? 'The SLOs were never breached.'
        : 'The system did not recover within the available window.',
    checks,
    guidance: { total: items.reduce((sum, item) => sum + item.count, 0), items: items.filter((item) => item.count > 0), explanations: used.explanations },
    well: well || null,
    improve: (worst && improvements[worst.id]) ?? null,
    happened,
    learn,
    tryAgain: report.summary.outcome === 'failure',
  }
}

export interface DecisionResult {
  title: string
  goal: string | null
  /** What the engine measured over the minutes after the decision point, against the moment before it. */
  result: string[]
}

export interface AlternativeExplanation {
  mine: DecisionResult
  alternative: DecisionResult
  /** Over the rest of the incident. */
  overall: string | null
}

/**
 * Why a replayed alternative went differently: each run's decision, its goal,
 * and what the engine measured after it. Both runs share everything before the
 * decision point, so they start from the same numbers.
 */
export function explainAlternative(
  mine: Simulation,
  alternative: Simulation,
  from: number,
  chosen: { title: string; guide: DecisionGuide | null },
  replacement: { title: string; guide: DecisionGuide } | null,
  database = 'the database',
): AlternativeExplanation {
  const timeline = (simulation: Simulation) => simulation.getPostmortem().timeline
  const describe = (simulation: Simulation): string[] => {
    const samples = timeline(simulation)
    const lines: string[] = []
    const say = (label: string, metric: Metric) => {
      const move = around(samples, from, metric, 5)
      if (!move || Math.abs(move.after - move.before) < 0.03) return
      lines.push(`${label} ${move.after < move.before ? 'decreased' : 'increased'} (${pct(move.before)} → ${pct(move.after)} on average over the next 5 minutes).`)
    }
    say('Application pressure', 'cpuUtilization')
    say(`${database[0]?.toUpperCase()}${database.slice(1)} pressure`, 'databaseUtilization')
    // A cache may not exist before the decision point, so only the minutes after it count.
    const hits = samples.filter((sample) => sample.time > from && sample.time <= from + 5).map((sample) => sample.metrics.cacheHitRate).filter((value): value is number => typeof value === 'number')
    if (hits.length > 0) lines.push(`The cache answered ${pct(hits.reduce((sum, value) => sum + value, 0) / hits.length)} of reads on average.`)
    const availability = around(samples, from, 'availability', 5)
    if (availability) lines.push(`Availability averaged ${percent(availability.after, 1)}.`)
    return lines
  }
  const rest = (simulation: Simulation) => {
    const values = timeline(simulation).filter((sample) => sample.time > from).map((sample) => sample.metrics.availability).filter((value): value is number => typeof value === 'number')
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
  }
  const a = rest(mine)
  const b = rest(alternative)
  return {
    mine: { title: chosen.title, goal: chosen.guide?.goal ?? null, result: describe(mine) },
    alternative: { title: replacement?.title ?? 'Do nothing', goal: replacement?.guide.goal ?? 'Leave the system as it was at that point.', result: describe(alternative) },
    overall:
      a !== null && b !== null && Math.abs(a - b) >= 0.005
        ? `From ${clock(from)} to the end, availability averaged ${percent(b, 1)} with the alternative and ${percent(a, 1)} in your run. The engine replayed everything else identically, so the difference comes from this one decision.`
        : a !== null && b !== null
          ? `From ${clock(from)} to the end, availability was about the same in both runs (${percent(a, 1)}).`
          : null,
  }
}
