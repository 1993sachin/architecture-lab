/**
 * The postmortem's reasoning review: what the operator did that good incident
 * reasoning looks like, which help they used, and one thing to learn. Built
 * from the engine's postmortem and the scenario guide; nothing is judged by a
 * model, and asking for help never costs anything.
 */
import type { Postmortem, Scenario, Simulation } from '@architecture-lab/engine'
import { clock, percent } from '../format'
import { decisionGuide } from '../explain'
import { guideFor, type DecisionGuide } from '../guide'
import type { GuidanceUse } from './context'

export interface ReasoningCheck {
  id: 'investigated-first' | 'measured-database' | 'reduced-database-work' | 'protected' | 'adapted'
  label: string
  done: boolean
}

export interface Reflection {
  success: boolean
  /** "You recovered the system at T+21", or that it did not recover. */
  recovered: string
  checks: ReasoningCheck[]
  guidance: { label: string; count: number }[]
  learning: string
}

interface Taken {
  time: number
  guide: DecisionGuide
}

function taken(report: Postmortem, scenario: Scenario): Taken[] {
  return report.decisions.map((record) => {
    const definition = scenario.decisions.find((decision) => decision.id === record.decisionId)
    const kind = definition?.reveals?.length ? ('investigate' as const) : ('change' as const)
    return { time: record.timestamp, guide: decisionGuide({ id: record.decisionId, kind, description: definition?.description ?? record.title }, scenario.id) }
  })
}

const aims = (entry: Taken, cause: string) => (entry.guide.addresses ?? []).includes(cause as never)

function utilizationOf(report: Postmortem, type: string): number | null {
  const component = report.architecture.final.components.find((candidate) => candidate.type === type)
  return component ? component.utilization : null
}

export function reflect(report: Postmortem, scenario: Scenario, used: GuidanceUse): Reflection {
  const decisions = taken(report, scenario)
  const roles = guideFor(scenario.id).facts
  const success = report.summary.outcome === 'success'
  const stabilizedAt = report.summary.stabilizedAt
  const firstCapacity = decisions.find((entry) => entry.guide.group === 'capacity')
  const firstInvestigation = decisions.find((entry) => entry.guide.group === 'investigate')
  const changes = report.constraints.timeline.filter((entry) => entry.change === 'updated' && entry.time > 0)
  const firstChange = changes[0]?.time
  const measured = report.decisions.some((record) => record.revealed.some((value) => value.id === roles.databaseLoad))
  const reducedWork = decisions.some((entry) => aims(entry, 'database') && entry.guide.group !== 'capacity' && entry.guide.group !== 'investigate')
  const protectedSystem = decisions.some((entry) => entry.guide.group === 'protect' && aims(entry, 'traffic'))
  const scaledApp = decisions.some((entry) => entry.guide.group === 'capacity' && aims(entry, 'application'))
  const database = utilizationOf(report, 'database')

  const checks: ReasoningCheck[] = [
    { id: 'investigated-first', label: firstCapacity ? 'Investigated before adding capacity' : 'Investigated before changing the system', done: Boolean(firstInvestigation) && (!firstCapacity || firstInvestigation!.time <= firstCapacity.time) },
    { id: 'measured-database', label: 'Measured the database instead of guessing', done: measured },
    { id: 'reduced-database-work', label: 'Reduced the work reaching the database', done: reducedWork },
    { id: 'protected', label: 'Protected the system while fixing it', done: protectedSystem },
    ...(firstChange !== undefined ? [{ id: 'adapted' as const, label: `Adapted after the constraints changed at ${clock(firstChange)}`, done: decisions.some((entry) => entry.time >= firstChange) }] : []),
  ]

  const recovered =
    stabilizedAt !== null
      ? `You recovered the system at ${clock(stabilizedAt)}.`
      : report.summary.incidentStartedAt === null
        ? 'The SLOs were never breached.'
        : `The SLOs were still breached when the incident window closed at ${clock(report.summary.duration)}.`

  let learning: string
  if (scaledApp && !reducedWork && database !== null && database >= 1)
    learning = `You scaled the application successfully, but the database became the bottleneck (${percent(database, 0)} at the end). Because most requests still reached it, adding application capacity alone cannot solve this workload.${success ? '' : ' Try the incident again.'}`
  else if (!measured && !success)
    learning = 'The database’s load stayed unknown the whole time. Before changing capacity, it is worth finding out where the limit actually is. Try the incident again.'
  else if (reducedWork && success)
    learning = 'Reducing the work that reached the database relieved the bottleneck, which more application capacity alone could not have done.'
  else if (protectedSystem && success)
    learning = 'Admitting less traffic on purpose kept the healthy part of the system serving while the bottleneck was dealt with. Protection costs some users; collapse costs all of them.'
  else if (success) learning = 'The system recovered. Compare your run with the reference strategies below: several different approaches work, with different trade-offs.'
  else if (stabilizedAt !== null) {
    const missed = report.objectives.filter((objective) => !objective.met).map((objective) => objective.description.replace(/\.$/, '').toLowerCase())
    learning = `The system recovered, but not every objective was met${missed.length > 0 ? `: ${missed.join('; ')}` : ''}. How fast you recover, and at what cost, is what separates the strategies below.`
  } else learning = 'The system did not recover in time. Look at where the bottleneck was at the end, and try a different strategy: several different approaches can work.'

  const guidance = [
    { label: 'Hints', count: used.hints },
    { label: 'Stronger hints', count: used.strongHints },
    { label: 'Guided reasoning', count: used.rescues },
    { label: '“Help me reason”', count: used.reasoningFlows },
    { label: 'Explanations opened', count: used.explanations },
  ]

  return { success, recovered, checks, guidance, learning }
}

/**
 * Why a replayed alternative went differently, from the two runs' recorded
 * metrics after the point where they diverge.
 */
export function explainAlternative(mine: Simulation, alternative: Simulation, from: number, replacement: { title: string; guide: DecisionGuide } | null): string[] {
  const after = (simulation: Simulation) => simulation.getPostmortem().timeline.filter((sample) => sample.time > from)
  const average = (samples: ReturnType<typeof after>, pick: (metrics: (typeof samples)[number]['metrics']) => number | undefined) => {
    const values = samples.map((sample) => pick(sample.metrics)).filter((value): value is number => typeof value === 'number')
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
  }
  const a = after(mine)
  const b = after(alternative)
  const lines: string[] = []
  if (replacement) lines.push(`${replacement.title}: ${replacement.guide.goal.replace(/\.$/, '')}.`)
  else lines.push('Doing nothing at that point leaves the rest of your run unchanged.')
  const compare = (label: string, pick: (metrics: (typeof a)[number]['metrics']) => number | undefined) => {
    const mineValue = average(a, pick)
    const theirs = average(b, pick)
    if (mineValue === null || theirs === null || Math.abs(mineValue - theirs) < 0.05) return
    lines.push(`From ${clock(from)} on, ${label} averaged ${percent(theirs, 0)} with the alternative, against ${percent(mineValue, 0)} in your run: ${theirs < mineValue ? 'less' : 'more'} pressure.`)
  }
  compare('database utilization', (metrics) => metrics.databaseUtilization)
  compare('application CPU', (metrics) => metrics.cpuUtilization)
  const availability = (samples: typeof a) => average(samples, (metrics) => metrics.availability)
  const mineAvailability = availability(a)
  const theirAvailability = availability(b)
  if (mineAvailability !== null && theirAvailability !== null && Math.abs(mineAvailability - theirAvailability) >= 0.005)
    lines.push(`Availability over the same period: ${percent(theirAvailability, 1)} instead of ${percent(mineAvailability, 1)}.`)
  return lines
}
