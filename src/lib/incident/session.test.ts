import { describe, expect, it } from 'vitest'
import { DECISION_MINUTES, IncidentSession } from './session'
import { counterfactual, groupSignals, playbookRuns, stepsOf, summarize, tradeOffs, verifyReplay } from './review'

function paged() {
  const session = new IncidentSession()
  session.startIncident()
  return session
}

describe('IncidentSession', () => {
  it('starts quiet at T+00 with hidden information withheld', () => {
    const view = new IncidentSession().view()
    expect(view.time).toBe(0)
    expect(view.status).toBe('quiet')
    expect(view.metrics.dbCpu.value).toBeNull()
    expect(view.metrics.dbCpu.known).toBe(false)
    expect(view.metrics.dbCpu.hint).toMatch(/investigate the database/i)
    expect(view.unknown.map((fact) => fact.id)).toEqual(expect.arrayContaining(['database-cpu', 'read-ratio']))
    expect(view.known).toEqual([])
    // The diagram never shows a load the tiles hide.
    const db = view.topology.rows.flat().find((node) => node.id === 'db')
    expect(db?.utilization).toBeNull()
  })

  it('pages the operator at the first SLO breach', () => {
    const session = new IncidentSession()
    const transition = session.startIncident()
    expect(transition.from).toBe(0)
    expect(transition.to).toBe(3)
    expect(transition.events.map((event) => event.eventId)).toContain('launch-goes-viral')
    expect(session.view().status).toBe('active')
    expect(session.view().sloBreaches.length).toBeGreaterThan(0)
  })

  it('investigating takes the scenario time, changes nothing, and reveals facts', () => {
    const session = paged()
    const before = session.view()
    const result = session.decide('investigate-database', 'Is it the database?')
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.transition.to - result.transition.from).toBe(2)
    expect(result.transition.revealed.map((value) => value.id)).toEqual(['database-cpu', 'database-latency', 'write-cost'])
    const after = session.view()
    expect(after.metrics.dbCpu.value).not.toBeNull()
    expect(after.budget.monthlyCost).toBe(before.budget.monthlyCost)
    expect(after.topology.rows.flat().map((node) => node.id)).toEqual(before.topology.rows.flat().map((node) => node.id))
    expect(after.known.map((fact) => fact.id)).toContain('database-cpu')
    expect(after.known[0]?.learnedAt).toBe(5)
  })

  it('a change takes one minute and reports before → after deltas', () => {
    const session = paged()
    const result = session.decide('enable-cache', 'Reads dominate')
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.transition.to - result.transition.from).toBe(DECISION_MINUTES)
    const cost = result.transition.deltas.find((delta) => delta.key === 'cost')
    expect(cost?.after).toBeGreaterThan(cost?.before ?? Infinity)
    expect(session.view().topology.rows.flat().find((node) => node.id === 'cache')?.isNew).toBe(true)
  })

  it('requires a rationale and stores it in the engine record', () => {
    const session = paged()
    expect(session.decide('enable-cache', '   ')).toEqual({ status: 'rejected', reason: expect.any(String) })
    expect(session.time).toBe(3)
    session.decide('enable-cache', 'Reads dominate')
    expect(session.simulation().getHistory().decisions[0]?.rationale).toBe('Reads dominate')
  })

  it('passes on engine rejections with their reason', () => {
    const session = paged()
    const result = session.decide('remove-database-replica', 'tidy up')
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.reason).toMatch(/no replica/i)
  })

  it('shows actions blocked by a limit as unavailable, with the reason', () => {
    const session = paged()
    session.decide('enable-cache', 'a')
    session.decide('add-database-replica', 'b')
    const queue = session.view().actions.find((action) => action.id === 'enable-async-writes')
    expect(queue?.enabled).toBe(false)
    expect(queue?.reason).toMatch(/complexity/i)
    // Decisions whose prerequisites are unmet are left out rather than shown disabled.
    expect(session.view().actions.find((action) => action.id === 'enable-cache')).toBeUndefined()
  })

  it('stops a wait early when something happens, and surfaces constraint changes', () => {
    const session = paged()
    session.wait(4) // T+03 → T+07
    const second = session.wait(5)
    expect(second.to).toBe(8)
    expect(second.events.map((event) => event.eventId)).toContain('second-wave')
    while (session.time < 24) session.wait(1)
    const cut = session.wait(5)
    expect(cut.to).toBe(25)
    expect(cut.constraintChanges).toEqual([expect.objectContaining({ constraintId: 'budget', before: 3500, after: 2800, change: 'updated' })])
    expect(cut.constraintChanges[0]?.cause?.eventId).toBe('budget-cut')
    expect(session.view().timeline.some((entry) => entry.kind === 'constraint' && entry.time === 25)).toBe(true)
  })

  it('records delayed consequences of decisions on the timeline', () => {
    const session = paged()
    session.decide('upgrade-database', 'more headroom')
    session.wait(5)
    const delayed = session.view().timeline.filter((entry) => entry.kind === 'consequence')
    expect(delayed).toEqual([expect.objectContaining({ time: 6, title: expect.stringMatching(/failover completes/i) })])
  })

  it('is deterministic: the same moves give the same result', () => {
    const play = () => {
      const session = paged()
      session.decide('investigate-traffic', 'what is it?')
      session.decide('enable-cache', 'reads')
      session.decide('scale-application', 'cpu')
      session.wait(5)
      session.finish()
      return session
    }
    const a = play()
    const b = play()
    expect(JSON.stringify(a.simulation().getResult())).toBe(JSON.stringify(b.simulation().getResult()))
    expect(JSON.stringify(IncidentSession.fromActions(a.actions()).simulation().getResult())).toBe(JSON.stringify(a.simulation().getResult()))
    expect(verifyReplay(a.simulation()).identical).toBe(true)
  })
})

describe('review helpers', () => {
  const session = paged()
  session.decide('enable-cache', 'reads')
  session.decide('scale-application', 'cpu')
  session.finish()
  const simulation = session.simulation()

  it('replays a counterfactual with one decision swapped, at the same times', () => {
    expect(stepsOf(simulation).map((step) => step.at)).toEqual([3, 4])
    const without = counterfactual(simulation, { index: 0, replacement: null })
    expect(without.getHistory().decisions.map((record) => record.decisionId)).toEqual(['scale-application'])
    const swapped = counterfactual(simulation, { index: 0, replacement: 'add-database-replica' })
    expect(swapped.getHistory().decisions.map((record) => [record.decisionId, record.timestamp])).toEqual([
      ['add-database-replica', 3],
      ['scale-application', 4],
    ])
    expect(swapped.isComplete()).toBe(true)
  })

  it('compares against every reference playbook in measured terms', () => {
    const runs = playbookRuns()
    expect(runs).toHaveLength(5)
    const mine = summarize('Your run', simulation)
    const offs = tradeOffs(mine, runs)
    expect(offs).toHaveLength(5)
    for (const off of offs) for (const line of [...off.better, ...off.worse]) expect(line).toMatch(/\d/)
  })

  it('groups learning signals by assessment', () => {
    const groups = groupSignals(simulation.getPostmortem().learningSignals)
    expect(groups.worked.length + groups.hurt.length + groups.noted.length).toBe(simulation.getPostmortem().learningSignals.length)
  })
})
