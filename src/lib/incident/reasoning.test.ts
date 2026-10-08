import { describe, expect, it } from 'vitest'
import { percent } from './format'
import { decisionGuide, groupActions } from './explain'
import { explainConsequence, explainSymptom, hypotheses, situation, stage, yourMove } from './reasoning'
import { IncidentSession, type IncidentView, type Transition } from './session'

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

/** Every sentence the reasoning layer would put on screen for this view. */
function allText(view: IncidentView): string {
  const why = explainSymptom(view)
  const move = yourMove(view)
  return [
    ...situation(view),
    ...hypotheses(view).map((cause) => `${cause.label} ${cause.evidence}`),
    ...(why ? [why.title, ...why.lines, ...why.associated, ...why.chains.flatMap((chain) => chain.steps.map((step) => `${step.label} ${step.value ?? ''}`))] : []),
    move ? `${move.framing} ${move.question}` : '',
  ].join('\n')
}

describe('incident reasoning', () => {
  it('at the page, explains what is visible and keeps the database an open question', () => {
    const session = paged()
    const view = session.view()
    const causes = hypotheses(view)
    expect(causes.find((cause) => cause.id === 'database')).toMatchObject({ status: 'unknown', check: { actionId: 'investigate-database' } })
    expect(causes.find((cause) => cause.id === 'application')?.status).toBe('unlikely')
    expect(situation(view).join(' ')).toMatch(/Availability is falling to 98.1% because 1.9% of requests are failing/)
    expect(situation(view).join(' ')).toMatch(/Database load is unknown/)
    expect(explainSymptom(view)?.title).toBe('Why is availability falling?')
    expect(explainSymptom(view)?.associated.join(' ')).toMatch(/can’t yet see which component is struggling/)
    expect(yourMove(view)?.question).toBe('What do you want to learn or change?')
    expect(stage(view)).toBe('early')
  })

  it('never leaks a value the operator has not observed', () => {
    const session = paged()
    const hidden = session.simulation().getState().metrics.databaseUtilization as number
    const text = allText(session.view())
    expect(text).not.toContain(percent(hidden, 0))
    expect(text).not.toMatch(/PostgreSQL CPU is/)
    expect(text).not.toMatch(/reads are \d/i)
  })

  it('turns an investigation into evidence and says how the picture changed', () => {
    const session = paged()
    const transition = applied(session, 'investigate-database')
    expect(hypotheses(session.view()).find((cause) => cause.id === 'database')?.status).toBe('likely')
    expect(explainConsequence(transition).changes).toContainEqual(expect.objectContaining({ id: 'database', from: 'unknown', to: 'likely' }))
  })

  it('shows that fixing one bottleneck can expose another', () => {
    const session = paged()
    applied(session, 'investigate-database')
    const explained = explainConsequence(applied(session, 'scale-application'))
    expect(explained.improved.map((delta) => delta.key)).toContain('appCpu')
    expect(explained.worsened.map((delta) => delta.key)).toContain('dbCpu')
    expect(explained.why.join(' ')).toMatch(/Fixing one bottleneck can expose another/)
    expect(explained.meanwhile.join(' ')).toMatch(/part of this change comes from the incident/)
  })

  it('explains a change it cannot measure without pretending to', () => {
    const session = paged()
    const explained = explainConsequence(applied(session, 'enable-cache'))
    expect(explained.why.join(' ')).toMatch(/PostgreSQL load is unknown, so watch errors and latency/)
  })

  it('treats rate limiting as a known, self-inflicted part of the availability loss', () => {
    const session = paged()
    const explained = explainConsequence(applied(session, 'enable-rate-limiting'))
    session.wait(3)
    const view = session.view()
    expect(hypotheses(view).find((cause) => cause.id === 'throttling')?.status).toBe('active')
    expect(explainSymptom(view)?.lines.join(' ')).toMatch(/turned away by your rate limit/)
    expect(explained.why.length).toBeGreaterThan(0)
  })

  it('frames a failover as its own decision point', () => {
    const session = paged()
    applied(session, 'upgrade-database')
    expect(yourMove(session.view())?.framing).toMatch(/failing over/)
  })

  it('frames decisions without ever naming an action', () => {
    const session = paged()
    const titles = session.view().actions.map((action) => action.title.toLowerCase())
    for (const step of ['investigate-database', 'enable-cache', 'wait', 'enable-rate-limiting', 'wait', 'wait', 'wait', 'wait']) {
      if (step === 'wait') session.wait(5)
      else applied(session, step)
      const move = yourMove(session.view())
      if (!move) break
      const text = `${move.framing} ${move.question}`.toLowerCase()
      for (const title of titles) expect(text).not.toContain(title)
    }
  })

  it('groups every action in the scenario by intent', () => {
    const decisions = new IncidentSession().scenario.decisions
    for (const decision of decisions) expect(decisionGuide({ id: decision.id, kind: 'change', description: '' }, '10x-traffic-incident').goal).not.toBe('')
    const groups = groupActions(paged().view().actions, '10x-traffic-incident').map((entry) => entry.group.id)
    expect(groups.slice(0, 2)).toEqual(['investigate', 'capacity'])
  })
})
