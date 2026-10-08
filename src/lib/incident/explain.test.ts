import { describe, expect, it } from 'vitest'
import { CONCEPTS, type ConceptId } from '@/lib/learning/concepts'
import { percent } from './format'
import { explainDecision, explainMetric, interpretFact, METRIC_CONCEPT } from './explain'
import { explainConsequence, relationships } from './reasoning'
import { IncidentSession, type MetricKey, type Transition } from './session'
import conceptsSource from '../learning/concepts.ts?raw'
import explainSource from './explain.ts?raw'
import reasoningSource from './reasoning.ts?raw'

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

const KEYS = Object.keys(METRIC_CONCEPT) as MetricKey[]

describe('engineering concepts', () => {
  it('covers every concept the runner needs, each with a definition and why it matters', () => {
    const required: ConceptId[] = ['rps', 'latency', 'p95', 'p99', 'error-rate', 'availability', 'throttling', 'cpu', 'memory', 'cache-hit-rate', 'queue-depth', 'slo', 'monthly-cost', 'impact', 'complexity']
    for (const id of required) {
      expect(CONCEPTS[id].what.length).toBeGreaterThan(20)
      expect(CONCEPTS[id].whyItMatters.length).toBeGreaterThan(20)
    }
    for (const key of KEYS) expect(CONCEPTS[METRIC_CONCEPT[key]]).toBeDefined()
  })

  it('explains p99 with a worked example', () => {
    expect(CONCEPTS.p99.example?.(3800)).toEqual(['p99 = 3.8 s', '99 out of 100 requests finish within 3.8 s.', 'The slowest 1 in 100 takes longer than that.'])
  })
})

describe('metric explanations', () => {
  it('never reveal a value the operator has not observed', () => {
    const session = paged()
    const hidden = session.simulation().getState().metrics.databaseUtilization as number
    const view = session.view()
    const db = explainMetric('dbCpu', view)
    expect(db.value).toBeNull()
    expect(db.unknown?.text).toMatch(/We don’t currently know how much database capacity is being consumed/)
    expect(db.unknown?.check?.actionId).toBe('investigate-database')
    const everything = JSON.stringify(KEYS.map((key) => explainMetric(key, view)))
    expect(everything).not.toContain(percent(hidden, 0))
    expect(everything).not.toContain(percent(hidden))
  })

  it('reads values in context instead of calling every high number bad', () => {
    const view = paged().view()
    expect(explainMetric('appCpu', view).reading).toMatchObject({ tone: 'fine' })
    expect(explainMetric('p99', view).reading).toMatchObject({ tone: 'concern', title: 'Why might this be bad?' })
    expect(explainMetric('throttled', view).reading?.text).toBe('Nothing is being turned away.')
    expect(explainMetric('cacheHit', view).reading?.text).toMatch(/No cache is deployed/)
  })

  it('calls a component a plausible contributor when it is visibly hotter, never the proven cause', () => {
    const session = paged()
    applied(session, 'investigate-database')
    const why = explainMetric('p99', session.view()).why.join(' ')
    expect(why).toMatch(/PostgreSQL is showing much higher utilization \(\d+%\) than the application tier \(\d+%\)\. That makes database saturation a plausible contributor, not a proven cause\./)
    expect(why).not.toMatch(/definitely|is causing/)
  })
})

describe('relationships', () => {
  it('only shows a chain the current state supports', () => {
    const session = paged()
    const ids = () => relationships(session.view()).map((chain) => chain.id)
    expect(ids()).toEqual(['load'])
    applied(session, 'enable-cache')
    expect(ids()).toContain('cache')
    expect(ids()).not.toContain('throttling')
    applied(session, 'enable-rate-limiting')
    session.wait(5)
    expect(ids()).toContain('throttling')
  })

  it('highlights where the evidence is: the unknown load before investigating, the bottleneck after', () => {
    const session = paged()
    const focus = () => relationships(session.view())[0]?.steps.find((step) => step.focus)?.label
    expect(focus()).toBe('Load on each component')
    applied(session, 'investigate-database')
    expect(focus()).toBe('A bottleneck')
  })
})

describe('decision explanations', () => {
  it('explain without recommending, and show the evidence about what the action targets', () => {
    const session = paged()
    const view = session.view()
    for (const action of view.actions) {
      const explained = explainDecision(action, view)
      expect(explained.goal).not.toBe('')
      expect(JSON.stringify(explained)).not.toMatch(/you should|best option|correct/i)
    }
    const cache = explainDecision(view.actions.find((action) => action.id === 'enable-cache')!, view)
    expect(cache.improves?.map((change) => `${change.direction} ${change.label}`)).toEqual(['down Database requests', 'down Database utilization', 'down Latency'])
    expect(cache.evidence).toEqual([expect.objectContaining({ label: 'Database saturation', status: 'unknown' })])
  })
})

describe('consequences', () => {
  it('scaling the application: the bottleneck shifts toward the database', () => {
    const session = paged()
    applied(session, 'investigate-database')
    const explained = explainConsequence(applied(session, 'scale-application'))
    expect(explained.goal).toBe('Increase application processing capacity.')
    expect(explained.why.join(' ')).toMatch(/the bottleneck has shifted toward the database, which now receives more pressure/)
    expect(explained.headline.length).toBeLessThanOrEqual(4)
  })

  it('enabling the cache: says why, and what risk is new', () => {
    const session = paged()
    applied(session, 'investigate-database')
    const explained = explainConsequence(applied(session, 'enable-cache'))
    expect(explained.why[0]).toMatch(/More requests are now served from cache instead of reaching PostgreSQL/)
    expect(explained.newRisk).toBe('Cache warm-up and invalidation now matter.')
  })

  it('holds the operator’s hypothesis up against the evidence without grading it', () => {
    const session = paged()
    const explained = explainConsequence(applied(session, 'investigate-database'), { id: 'application', label: 'Application capacity' })
    expect(explained.hypothesis).toMatchObject({ label: 'Application capacity' })
    expect(explained.hypothesis?.evidence).toMatch(/Application CPU is \d+%/)
    expect(explainConsequence(applied(session, 'enable-cache'), { id: 'unsure', label: 'Not sure' }).hypothesis).toBeUndefined()
  })

  it('interprets a learned fact, hedged', () => {
    const session = paged()
    applied(session, 'investigate-database')
    const view = session.view()
    const cpu = view.known.find((fact) => fact.id === 'database-cpu')!
    expect(cpu.text).toMatch(/^PostgreSQL CPU: \d+%$/)
    expect(interpretFact(cpu, view)).toMatch(/plausible contributor/)
  })
})

describe('no scenario-specific code in the generic layers', () => {
  it('keeps component ids, product names and scenario ids out of reasoning, explanations and concepts', () => {
    for (const [file, source] of Object.entries({ reasoningSource, explainSource, conceptsSource })) {
      expect(source, file).not.toMatch(/'db'|'app'|PostgreSQL'|Redis|10x-traffic|scenario ===/)
    }
  })
})
