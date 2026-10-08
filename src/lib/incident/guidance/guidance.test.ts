import { describe, expect, it } from 'vitest'
import { playbookRuns, playSteps, PLAYBOOKS } from '../review'
import { hypotheses } from '../reasoning'
import { IncidentSession, SCENARIO, type IncidentView, type Transition } from '../session'
import { EMPTY_HISTORY, guidanceContext, outcomeOf, type GuidanceHistory } from './context'
import { evidence, missing, symptoms } from './flow'
import { guidance, investigateFirst } from './hints'
import { newClue } from './clues'
import { explainAlternative, reflect } from './reflection'
import { objectiveResult } from './objectives'
import { useIncidentStore } from '@/store/incidentStore'
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
  const investigateFirst = () => PLAYBOOKS.find((playbook) => /investigate first/i.test(playbook.name))!.steps

  it('reviews decision quality and counts help without touching the score', () => {
    const run = playSteps(investigateFirst())
    const used = { hints: 2, strongHints: 1, rescues: 1, reasoningFlows: 0, explanations: 3 }
    const reflection = reflect(run.getPostmortem(), SCENARIO, used)
    expect(reflection.success).toBe(true)
    expect(reflection.headline).toMatch(/You recovered the system at T\+\d\d/)
    expect(reflection.checks.find((check) => check.id === 'investigated-first')?.status).toBe('good')
    expect(reflection.checks.find((check) => check.id === 'measured-database')?.status).toBe('good')
    expect(reflection.checks.find((check) => check.id === 'reduced-database-work')?.status).toBe('good')
    expect(reflection.guidance.total).toBe(4)
    expect(reflection.well).toMatch(/You investigated before your first capacity change/)
    expect(reflection.tryAgain).toBe(false)
    // Help is reported, never scored: the same decisions give the same score.
    expect(run.getPostmortem().summary.score).toBe(playSteps(investigateFirst()).getPostmortem().summary.score)
  })

  it('flags scaling the application after the database was seen to be constrained, and says what happened', () => {
    const run = playSteps([
      { at: 3, decision: 'investigate-database', rationale: 'x' },
      { at: 5, decision: 'scale-application', rationale: 'x' },
    ])
    const reflection = reflect(run.getPostmortem(), SCENARIO, EMPTY_HISTORY.used)
    expect(reflection.checks.find((check) => check.id === 'scaled-into-constraint')?.status).toBe('concern')
    expect(reflection.improve).toMatch(/after database pressure was already visible \(PostgreSQL at \d+%\)/)
    expect(reflection.happened).toMatch(/reduced application pressure .* but pushed more work toward PostgreSQL/)
    expect(reflection.learn).toMatch(/the bottleneck may have shifted rather than disappeared/)
  })

  it('teaches on failure instead of labelling the strategy wrong', () => {
    const run = playSteps([{ at: 3, decision: 'scale-application', rationale: 'x' }])
    const reflection = reflect(run.getPostmortem(), SCENARIO, EMPTY_HISTORY.used)
    expect(reflection.success).toBe(false)
    expect(reflection.tryAgain).toBe(true)
    expect(reflection.checks.find((check) => check.id === 'investigated-first')?.status).toBe('missed')
    const all = [reflection.headline, reflection.well, reflection.improve, reflection.happened, reflection.learn].join(' ')
    expect(all).not.toMatch(/wrong|should have|correct/i)
  })

  it('explains a counterfactual as your decision against the alternative, from engine results', () => {
    const run = playSteps([{ at: 3, decision: 'scale-application', rationale: 'x' }])
    const alternative = playSteps([{ at: 3, decision: 'enable-cache', rationale: 'x' }])
    const scale = { title: 'Scale the application', guide: { group: 'capacity' as const, goal: 'Increase application processing capacity.' } }
    const cache = { title: 'Add a Redis cache', guide: { group: 'optimize' as const, goal: 'Reduce database pressure.' } }
    const why = explainAlternative(run, alternative, 3, scale, cache, 'PostgreSQL')
    expect(why.mine.goal).toBe('Increase application processing capacity.')
    expect(why.alternative.result.join(' ')).toMatch(/The cache answered \d+% of reads/)
    expect(why.overall).toMatch(/availability averaged/)
  })
})

describe('objectives', () => {
  it('does not equate lower utilization with more capacity: it judges work served', () => {
    const session = paged()
    applied(session, 'investigate-database')
    const scaled = applied(session, 'scale-application')
    // Application CPU fell after scaling, yet fewer requests were served.
    expect(scaled.after.metrics.appCpu.value!).toBeLessThan(scaled.before.metrics.appCpu.value!)
    const result = objectiveResult('capacity', scaled)!
    expect(result.verdict).not.toBe('better')
    expect(result.text).toMatch(/Successful requests/)
    expect(result.text).not.toMatch(/CPU/)
  })

  it('credits capacity when more work is served without more failures', () => {
    const session = paged()
    session.wait(4)
    applied(session, 'enable-rate-limiting')
    session.wait(2)
    applied(session, 'enable-cache')
    session.wait(3)
    const relaxed = applied(session, 'relax-rate-limit')
    const result = objectiveResult('capacity', relaxed)!
    if (result.verdict === 'better') expect(result.text).toMatch(/served more work without failing more/)
    else expect(['worse', 'unclear']).toContain(result.verdict)
  })
})

describe('guidance ladder is finite and contextual', () => {
  it('resets when the situation changes and does not repeat guided reasoning forever', () => {
    useIncidentStore.getState().runAgain()
    const store = () => useIncidentStore.getState()
    store().start()
    store().acknowledgePage()
    store().askHint()
    store().askHint()
    store().askHint()
    expect(store().hint).toMatchObject({ level: 4, exhausted: false })
    store().askHint()
    expect(store().hint).toMatchObject({ level: 4, exhausted: true })
    // Asking again does not count as more guidance used.
    expect(store().guidance.used).toMatchObject({ hints: 1, strongHints: 1, rescues: 1 })
    store().revisitHint()
    expect(store().hint?.exhausted).toBe(false)
    // Measuring the database is a new situation: the ladder starts again at the hint.
    store().select('investigate-database')
    store().confirm('Is it the database?')
    store().askHint()
    expect(store().hint).toMatchObject({ level: 2, exhausted: false })
  })

  it('struggle detection is deterministic', () => {
    const run = () => {
      const session = paged()
      const outcomes = [applied(session, 'scale-application'), session.wait(1), session.wait(1)].map(outcomeOf)
      return detectStruggle(guidanceContext(session.view(), { ...EMPTY_HISTORY, outcomes }))
    }
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
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
