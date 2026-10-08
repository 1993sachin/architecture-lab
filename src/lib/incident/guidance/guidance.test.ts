import { describe, expect, it } from 'vitest'
import { playbookRuns, playSteps, PLAYBOOKS } from '../review'
import { hypotheses } from '../reasoning'
import { IncidentSession, SCENARIO, type IncidentView, type Transition } from '../session'
import { EMPTY_HISTORY, guidanceContext, outcomeOf, type GuidanceHistory } from './context'
import { evidence, missing, symptoms } from './flow'
import { guidance, investigateFirst } from './hints'
import { newClue } from './clues'
import { reflect } from './reflection'
import { situationOf } from './situation'
import { detectStruggle, nextLevel } from './struggle'

function paged() {
  const session = new IncidentSession()
  session.startIncident()
  return session
}

function applied(session: IncidentSession, id: string): Transition {
  const result = session.decide(id, 'test')
  if (result.status !== 'applied') throw new Error(result.reason)
  return result.transition
}

/** The page, with some observable numbers replaced: a state the rules must read correctly. */
function observed(overrides: Partial<Record<'appCpu' | 'dbCpu' | 'availability', number | null>>): IncidentView {
  const view = structuredClone(paged().view())
  for (const [key, value] of Object.entries(overrides)) {
    const metric = view.metrics[key as keyof typeof overrides]
    metric.value = value
    metric.known = value !== null
  }
  return view
}

const text = (view: IncidentView, level: 2 | 3 | 4) => {
  const hint = guidance(guidanceContext(view), level)
  return [...hint.lines, hint.question ?? '', hint.conclusion ?? ''].join(' ')
}
const actionIds = (view: IncidentView, level: 2 | 3 | 4) => guidance(guidanceContext(view), level).actions.map((action) => action.actionId)

describe('guidance ladder', () => {
  it('1. application overloaded, database with room: points at application capacity', () => {
    const view = observed({ appCpu: 0.95, dbCpu: 0.5 })
    expect(situationOf(guidanceContext(view))).toBe('application-overloaded')
    expect(text(view, 2)).toMatch(/application tier is under significant pressure \(95%\)/)
    expect(text(view, 2)).not.toMatch(/scale|add capacity/i)
    expect(actionIds(view, 4)).toContain('scale-application')
  })

  it('2. database overloaded while the application has room: steers downstream, not to more app capacity', () => {
    const view = observed({ appCpu: 0.45, dbCpu: 0.95 })
    expect(situationOf(guidanceContext(view))).toBe('database-overloaded')
    expect(text(view, 2)).toMatch(/application has spare capacity, but PostgreSQL is heavily utilized \(95%\)/)
    const options = actionIds(view, 4)
    expect(options).not.toContain('scale-application')
    expect(options.length).toBeGreaterThanOrEqual(3)
  })

  it('3. traffic beyond capacity: asks how to protect the system and offers protection among the options', () => {
    const session = paged()
    session.wait(5)
    const view = session.view()
    expect(situationOf(guidanceContext(view))).toBe('beyond-capacity')
    expect(text(view, 2)).toMatch(/How might you protect the capacity you do have\?/)
    expect(actionIds(view, 4)).toContain('enable-rate-limiting')
    expect(actionIds(view, 4).length).toBeGreaterThan(2)
  })

  it('4. database unknown: hint asks, stronger hint names the unknown, guided reasoning recommends investigating', () => {
    const view = paged().view()
    expect(situationOf(guidanceContext(view))).toBe('downstream-unknown')
    expect(text(view, 2)).toMatch(/which downstream component might be limiting throughput\?/)
    expect(text(view, 2)).not.toMatch(/PostgreSQL|database/i)
    expect(text(view, 3)).toMatch(/We don’t currently know how much database capacity is being consumed/)
    expect(actionIds(view, 3)).toEqual(['investigate-database'])
    const rescue = guidance(guidanceContext(view), 4)
    expect(rescue.lines.length).toBeGreaterThanOrEqual(4)
    expect(rescue.conclusion).toMatch(/A reasonable next step is to investigate the database before changing capacity/)
    // Before a capacity change, the unknown is pointed out, not decided for the operator.
    const scale = view.actions.find((action) => action.id === 'scale-application')!
    expect(investigateFirst(scale, guidanceContext(view))).toMatchObject({ text: expect.stringMatching(/enough evidence to determine whether PostgreSQL is saturated/), check: { actionId: 'investigate-database' } })
    const investigate = view.actions.find((action) => action.id === 'investigate-database')!
    expect(investigateFirst(investigate, guidanceContext(view))).toBeNull()
  })

  it('5. a bad decision explains the consequence as a clue, and the incident can still be recovered', () => {
    const session = paged()
    applied(session, 'investigate-database')
    const scaled = applied(session, 'scale-application')
    const clue = newClue(scaled)
    expect(clue?.text).toMatch(/bottleneck appears to have shifted downstream/)
    expect(clue?.question).toMatch(/\?$/)
    // Scaling first does not end the run: the engine's own "Scale first" playbook recovers.
    const scaleFirst = playbookRuns().find((run) => /scale first/i.test(run.playbook.name))!
    expect(scaleFirst.summary.stabilizedAt).not.toBeNull()
    // Without having measured the database, the clue points at what can't be seen.
    const blind = paged()
    expect(newClue(applied(blind, 'scale-application'))?.text).toMatch(/PostgreSQL, which you can’t see yet, could be/)
  })

  it('6. repeated struggle raises a subtle prompt, and each ask climbs the ladder to guided reasoning', () => {
    const session = paged()
    const outcomes = [applied(session, 'scale-application'), session.wait(1), session.wait(1)].map(outcomeOf)
    const history: GuidanceHistory = { ...EMPTY_HISTORY, outcomes }
    const struggle = detectStruggle(guidanceContext(session.view(), history))
    expect(struggle.struggling).toBe(true)
    expect(struggle.prompt).toMatch(/Want a hint\?/)
    expect(detectStruggle(guidanceContext(paged().view())).struggling).toBe(false)
    const levels = [nextLevel(0)]
    while (levels.length < 3) levels.push(nextLevel(levels[levels.length - 1] as 2 | 3 | 4))
    expect(levels).toEqual([2, 3, 4])
    expect(levels.map((level) => guidance(guidanceContext(session.view(), history), level).title)).toEqual(['Hint', 'Stronger hint', 'Guided reasoning'])
    expect(detectStruggle(guidanceContext(paged().view(), { ...EMPTY_HISTORY, stuck: 1 })).signals).toEqual(['asked'])
  })

  it('7. several different strategies succeed, and guided reasoning offers several, never one answer', () => {
    const successes = playbookRuns().filter((run) => run.summary.outcome === 'success')
    expect(successes.length).toBeGreaterThanOrEqual(3)
    // Different mixes of decisions, not one sequence with small variations.
    const strategies = new Set(successes.map((run) => [...new Set(run.playbook.steps.map((step) => step.decision))].sort().join(',')))
    expect(strategies.size).toBeGreaterThanOrEqual(3)
    const session = paged()
    applied(session, 'investigate-database')
    const view = session.view()
    const options = guidance(guidanceContext(view), 4).actions
    expect(options.length).toBeGreaterThanOrEqual(3)
    expect(new Set(options.map((option) => option.why)).size).toBe(options.length)
    for (const option of options.filter((candidate) => candidate.kind === 'change')) expect(option.tradeoff ?? option.why).toBeTruthy()
  })
})

describe('guidance rules', () => {
  it('are deterministic: the same state and history give the same guidance', () => {
    const view = paged().view()
    for (const level of [2, 3, 4] as const) expect(JSON.stringify(guidance(guidanceContext(view), level))).toBe(JSON.stringify(guidance(guidanceContext(paged().view()), level)))
  })

  it('never show what the operator cannot see', () => {
    const session = paged()
    const view = session.view()
    const hidden = session.simulation().getState().metrics.databaseUtilization as number
    const all = [2, 3, 4].map((level) => text(view, level as 2 | 3 | 4)).join(' ') + JSON.stringify(evidence(view)) + JSON.stringify(symptoms(view))
    expect(all).not.toContain(`${Math.round(hidden * 100)}%`)
  })

  it('never tell the operator what to do', () => {
    for (const view of [paged().view(), observed({ appCpu: 0.95, dbCpu: 0.5 }), observed({ appCpu: 0.45, dbCpu: 0.95 })])
      for (const level of [2, 3, 4] as const) expect(text(view, level)).not.toMatch(/you should|best option|correct answer|the answer is/i)
  })
})

describe('Help me reason', () => {
  it('reads what is hurting, what is known and what is missing from the view', () => {
    const view = paged().view()
    const hurting = symptoms(view)
    expect(hurting.map((symptom) => symptom.label)).toEqual(['Latency', 'Errors', 'Availability', 'Capacity'])
    expect(hurting.find((symptom) => symptom.id === 'latency')).toMatchObject({ hurting: true, reading: expect.stringMatching(/775 ms.*500 ms. It is breaching/) })
    expect(evidence(view).unknown).toContain('PostgreSQL CPU')
    expect(missing(view, 'database')).toMatchObject({ status: 'unknown', action: { actionId: 'investigate-database' } })
    expect(missing(view, 'application')).toMatchObject({ status: 'known', text: expect.stringMatching(/already know/) })
    expect(missing(view, 'cache').status).toBe('absent')
    expect(missing(view, 'composition')).toMatchObject({ status: 'unknown', action: { actionId: 'investigate-traffic' } })
  })
})

describe('postmortem reflection', () => {
  it('records reasoning and help used, without touching the score', () => {
    const run = playSteps(PLAYBOOKS.find((playbook) => /investigate first/i.test(playbook.name))!.steps)
    const used = { hints: 2, strongHints: 1, rescues: 0, reasoningFlows: 1, explanations: 3 }
    const reflection = reflect(run.getPostmortem(), SCENARIO, used)
    expect(reflection.success).toBe(true)
    expect(reflection.recovered).toMatch(/You recovered the system at T\+\d\d/)
    expect(reflection.checks.find((check) => check.id === 'investigated-first')?.done).toBe(true)
    expect(reflection.checks.find((check) => check.id === 'measured-database')?.done).toBe(true)
    expect(reflection.guidance.find((entry) => entry.label === 'Hints')?.count).toBe(2)
    expect(run.getPostmortem().summary.score).toBe(playSteps(PLAYBOOKS.find((playbook) => /investigate first/i.test(playbook.name))!.steps).getPostmortem().summary.score)
  })

  it('explains why scaling alone fell short', () => {
    const run = playSteps([{ at: 3, decision: 'scale-application', rationale: 'x' }, { at: 5, decision: 'scale-application', rationale: 'x' }])
    const reflection = reflect(run.getPostmortem(), SCENARIO, EMPTY_HISTORY.used)
    expect(reflection.learning).toMatch(/database became the bottleneck|stayed unknown/)
    expect(reflection.learning).toMatch(/Try the incident again/)
  })
})

describe('guidance stays generic', () => {
  it('has no scenario ids, component ids or product names in its rules', () => {
    const sources = import.meta.glob(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(8)
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/'db'|'app'|PostgreSQL|Redis|10x-traffic|scenario ===|scenarioId ===/)
      expect(source, file).not.toMatch(/'scale-application'|'enable-cache'|'investigate-database'|'enable-rate-limiting'/)
    }
    expect(hypotheses(paged().view()).length).toBeGreaterThan(0)
  })
})
