/**
 * The guidance ladder: a hint, a stronger hint, then guided reasoning.
 *
 * Every rung is built from the observable view. Hints ask questions; the
 * stronger hint names what to look at; guided reasoning walks the evidence
 * and, when the next step is a decision rather than an investigation, offers
 * every option that fits the evidence with its trade-off, never one answer.
 */
import { percent, ms, rps, usd } from '../format'
import { decisionGuide } from '../explain'
import { guideFor } from '../guide'
import { databaseName } from '../reasoning'
import type { ActionView, IncidentView } from '../session'
import type { GuidanceContext } from './context'
import { situationOf, type SituationId } from './situation'

/** 0 none · 1 context (explanations) · 2 hint · 3 stronger hint · 4 guided reasoning. */
export type GuidanceLevel = 0 | 1 | 2 | 3 | 4

export interface HintAction {
  actionId: string
  title: string
  kind: ActionView['kind']
  /** When it tends to help. */
  why?: string
  /** What it costs beyond money. */
  tradeoff?: string
}

export interface Guidance {
  level: 2 | 3 | 4
  situation: SituationId
  title: string
  /** Evidence, in plain sentences. For guided reasoning, a numbered walk through it. */
  lines: string[]
  /** The question the operator should answer for themselves. */
  question?: string
  /** Guided reasoning only: what the evidence adds up to. */
  conclusion?: string
  /** Buttons that open a decision. The operator still confirms it. */
  actions: HintAction[]
}

const pct = (ratio: number) => percent(ratio, 0)

function enabled(view: IncidentView, predicate: (action: ActionView) => boolean): ActionView[] {
  return view.actions.filter((action) => action.enabled && predicate(action))
}

function option(view: IncidentView, action: ActionView): HintAction {
  const guide = decisionGuide(action, view.scenarioId)
  return { actionId: action.id, title: action.title, kind: action.kind, why: guide.helpsWhen?.[0] ?? guide.goal, tradeoff: guide.tradeoffs?.[0] }
}

/** Actions aimed at a cause, by what the scenario guide says they address. Never by id. */
function aimedAt(view: IncidentView, cause: string, groups?: string[]): HintAction[] {
  return enabled(view, (action) => {
    const guide = decisionGuide(action, view.scenarioId)
    return action.kind === 'change' && (guide.addresses ?? []).includes(cause as never) && (!groups || groups.includes(guide.group))
  }).map((action) => option(view, action))
}

function investigation(view: IncidentView, factId: string | undefined): HintAction[] {
  if (!factId) return []
  const unknown = view.unknown.find((fact) => fact.id === factId)
  const action = unknown && view.actions.find((candidate) => candidate.enabled && unknown.revealedBy.includes(candidate.title))
  return action ? [option(view, action)] : []
}

function fact(view: IncidentView, id: string | undefined): number | null {
  const known = id ? view.known.find((candidate) => candidate.id === id) : undefined
  return typeof known?.value === 'number' ? known.value : null
}

/** The evidence everyone starts from, numbered for guided reasoning. */
function walk(view: IncidentView): string[] {
  const steps: string[] = []
  const traffic = view.metrics.traffic
  const start = traffic.series[0]
  if (traffic.value !== null && start) steps.push(`Traffic is ${rps(traffic.value)}, ${Number((traffic.value / start).toFixed(1))}× where your shift started.`)
  const app = view.metrics.appCpu.value
  if (app !== null) steps.push(`Application CPU is ${pct(app)}${app < 0.85 ? ', so it has room' : app >= 1 ? ', past its capacity' : ', close to its limit'}.`)
  const p99 = view.metrics.p99.value
  const errors = view.metrics.errors.value
  if (p99 !== null && errors !== null) steps.push(`Requests are slow (p99 ${ms(p99)}) and ${pct(errors)} are failing.`)
  const db = view.metrics.dbCpu.value
  steps.push(db === null ? `${databaseName(view)} utilization is currently unknown.` : `${databaseName(view)} CPU is ${pct(db)}${db >= 1 ? ', past its capacity' : db >= 0.85 ? ', close to its limit' : ', with room'}.`)
  return steps
}

export function guidance(context: GuidanceContext, level: 2 | 3 | 4): Guidance {
  const { view } = context
  const situation = situationOf(context)
  const db = databaseName(view)
  const app = view.metrics.appCpu.value
  const dbCpu = view.metrics.dbCpu.value
  const roles = guideFor(view.scenarioId).facts
  const reads = fact(view, roles.readShare)
  const cacheable = fact(view, roles.cacheableShare)
  const collapsing = (view.metrics.availability.value ?? 1) < 0.6 && (view.metrics.throttled.value ?? 0) < 0.0005
  const base = { level, situation, actions: [] as HintAction[] }
  const titleOf = { 2: 'Hint', 3: 'Stronger hint', 4: 'Guided reasoning' } as const
  const make = (rest: Omit<Guidance, 'level' | 'situation' | 'title' | 'actions'> & { actions?: HintAction[] }): Guidance => ({ ...base, title: titleOf[level], ...rest, actions: rest.actions ?? [] })
  const decisionOptions = (...lists: HintAction[][]) => {
    const seen = new Set<string>()
    return lists.flat().filter((action) => (seen.has(action.actionId) ? false : (seen.add(action.actionId), true)))
  }

  switch (situation) {
    case 'downstream-unknown': {
      const check = investigation(view, roles.databaseLoad)
      if (level === 2) return make({ lines: [`Your application has spare CPU (${app === null ? '?' : pct(app)}), yet requests are slow and failing.`], question: 'Before adding more application capacity, which downstream component might be limiting throughput?' })
      if (level === 3)
        return make({
          lines: [`The application depends on ${db}.`, `We don’t currently know how much database capacity is being consumed.`],
          question: 'Would that information help you decide what to do next?',
          actions: check,
        })
      return make({
        lines: walk(view),
        conclusion: `This means the application does not currently look like the obvious bottleneck. You don’t have enough evidence yet to know whether ${db} is saturated. A reasonable next step is to investigate the database before changing capacity.${collapsing ? ' If you need to stop the damage first, admitting less traffic protects the rest of the system while you look.' : ''}`,
        actions: decisionOptions(check, collapsing ? aimedAt(view, 'traffic', ['protect']) : []),
      })
    }

    case 'application-overloaded': {
      const unknown = dbCpu === null && view.topology.rows.flat().some((node) => node.type === 'database')
      if (level === 2) return make({ lines: [`The application tier is under significant pressure (${app === null ? '?' : pct(app)}).`], question: 'What could increase how much work it can process, or reduce the work reaching it?' })
      if (level === 3)
        return unknown
          ? make({
              lines: [`Adding application capacity passes more requests to ${db}, and its load is unknown.`],
              question: 'Do you want to know whether the database can take more before you scale, or is the risk worth it?',
              actions: investigation(view, roles.databaseLoad),
            })
          : make({ lines: [`Application CPU is ${app === null ? '?' : pct(app)} while ${db} is at ${dbCpu === null ? '?' : pct(dbCpu)}.`], question: 'Which tier has room to spare, and which one limits the path?' })
      return make({
        lines: walk(view),
        conclusion: unknown
          ? 'The application is the busiest tier you can see, but the database behind it is unknown. You can add capacity now and watch the database, or investigate it first. Options that fit this evidence:'
          : 'The application is the busiest tier. Options that fit this evidence, each with a different trade-off:',
        actions: decisionOptions(unknown ? investigation(view, roles.databaseLoad) : [], aimedAt(view, 'application')),
      })
    }

    case 'database-overloaded':
    case 'both-overloaded': {
      const both = situation === 'both-overloaded'
      if (level === 2)
        return make(
          both
            ? { lines: [`Both the application (${pct(app ?? 0)}) and ${db} (${pct(dbCpu ?? 0)}) are past capacity.`], question: 'If you relieve one of them, what happens to the other?' }
            : { lines: [`The application has spare capacity, but ${db} is heavily utilized (${pct(dbCpu ?? 0)}).`], question: 'What could reduce the work reaching the database, or give it more room?' },
        )
      if (level === 3) {
        if (reads !== null)
          return make({
            lines: [`${pct(reads)} of requests are reads${cacheable !== null ? `, and ${pct(cacheable)} of those ask for the same popular data` : ''}.`, ...(both ? [`More application capacity would pass even more of them to ${db}.`] : [])],
            question: 'A large portion of this traffic may be repeated reads. What mechanism could prevent those reads from reaching the database?',
          })
        return make({
          lines: [`${db} is the busiest component you can see${both ? ', and it sits behind the application' : ''}.`, 'You don’t know yet what its load is made of: reads, or writes.'],
          question: 'Would knowing that change which fix makes sense?',
          actions: investigation(view, roles.readShare),
        })
      }
      return make({
        lines: walk(view),
        conclusion: both
          ? `${db} sits behind the application, so adding application capacity alone would send it even more work. Several strategies fit this evidence. They trade cost, complexity and users served differently:`
          : `The application is not the limit; ${db} is. Several strategies fit this evidence. They trade cost, complexity and users served differently:`,
        actions: decisionOptions(aimedAt(view, 'database', ['optimize', 'capacity']), aimedAt(view, 'traffic', ['protect'])),
      })
    }

    case 'beyond-capacity': {
      const availability = view.metrics.availability.value ?? 0
      if (level === 2) return make({ lines: [`The system is receiving more traffic than it can safely process: about ${Math.round((1 - availability) * 100)} in 100 requests fail.`], question: 'How might you protect the capacity you do have?' })
      if (level === 3)
        return make({
          lines: ['When more arrives than the system can handle, every request competes and almost all of them fail.'],
          question: 'What if you admitted less traffic, on purpose, while you fix the bottleneck? Who would that cost, and who would it save?',
        })
      return make({
        lines: walk(view),
        conclusion: 'There are two kinds of moves here, and they combine: protect the system now by admitting less traffic, and relieve the bottleneck so it can take more. Options that fit this evidence:',
        actions: decisionOptions(aimedAt(view, 'traffic', ['protect']), view.metrics.dbCpu.value === null ? investigation(view, roles.databaseLoad) : [], aimedAt(view, 'database', ['optimize', 'capacity']), aimedAt(view, 'application', ['capacity'])),
      })
    }

    case 'cache-warming': {
      const hit = view.metrics.cacheHit.value ?? 0
      if (level === 2) return make({ lines: [`The cache answers ${pct(hit)} of reads so far.`], question: 'What happens to that number over the next few minutes, and what will that do to the database?' })
      if (level === 3) return make({ lines: ['A new cache starts empty and fills as popular data is read. Its effect is still arriving.'], question: 'Do you give it a minute or two to show its effect, or is something else urgent right now?' })
      return make({
        lines: walk(view),
        conclusion: 'Part of the effect of your last change is still arriving. Waiting is a decision too: it shows you what the cache does on its own. If something else is clearly past capacity, you can act on that in the meantime.',
      })
    }

    case 'failover':
      if (level === 2) return make({ lines: [`${db} is failing over and has less capacity until it finishes.`], question: 'What could keep the rest of the system healthy until then?' })
      if (level === 3) return make({ lines: ['During a failover the database can serve less. Reducing what reaches it, or what reaches the system, buys time.'], question: 'Is it worth turning some users away for a few minutes?' })
      return make({ lines: walk(view), conclusion: 'The failover ends on its own. Until then you can wait it out, or protect the system:', actions: aimedAt(view, 'traffic', ['protect']) })

    case 'over-budget': {
      const over = view.budget.headroom === null ? '' : `${usd(-view.budget.headroom)}/month `
      if (level === 2) return make({ lines: [`The SLOs are holding, but you are ${over}over budget.`], question: 'Which of the things you added are you still using?' })
      if (level === 3) return make({ lines: [`Look at what has headroom now: application CPU ${app === null ? '?' : pct(app)}${dbCpu === null ? '' : `, ${db} ${pct(dbCpu)}`}.`], question: 'Capacity with lots of spare room is what you can give back. Which is it?' })
      return make({
        lines: walk(view),
        conclusion: 'Giving back capacity you don’t need brings the bill down; giving back too much breaks the SLOs again. Options that fit:',
        actions: enabled(view, (action) => decisionGuide(action, view.scenarioId).group === 'cost').map((action) => option(view, action)),
      })
    }

    case 'stable':
      return make({ lines: ['The SLOs are holding.'], question: 'What could break next: is traffic still moving, and is anything close to its limit?' })

    default:
      if (level === 2) return make({ lines: ['Nothing you can see is clearly past its capacity, yet the SLOs are breached.'], question: 'What don’t you know yet?' })
      return make({ lines: walk(view), question: 'Which unknown would tell you the most?', actions: view.actions.filter((action) => action.enabled && action.kind === 'investigate').map((action) => option(view, action)) })
  }
}

/**
 * Before a decision: when it is aimed at a cause nobody has measured yet, say
 * so, and offer the investigation. The operator can go ahead anyway.
 */
export function investigateFirst(action: ActionView, context: GuidanceContext): { text: string; check: HintAction } | null {
  const { view, causes } = context
  if (action.kind !== 'change') return null
  const guide = decisionGuide(action, view.scenarioId)
  if (guide.group !== 'capacity') return null
  // Capacity for one tier passes more work to the next: an unknown database matters for both.
  const unknown = causes.find((cause) => cause.status === 'unknown' && cause.check && (cause.id === 'database' || (guide.addresses ?? []).includes(cause.id)))
  const check = unknown?.check && view.actions.find((candidate) => candidate.id === unknown.check?.actionId && candidate.enabled)
  if (!unknown || !check) return null
  const subject = unknown.id === 'database' ? `whether ${databaseName(view)} is saturated` : unknown.label.toLowerCase()
  return { text: `You don’t yet have enough evidence to determine ${subject}. Consider investigating before changing capacity.`, check: option(view, check) }
}
