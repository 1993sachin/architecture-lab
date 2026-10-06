import { describe, expect, it } from 'vitest'
import {
  ARRIVAL_GAP_MS,
  DEFAULT_CONFIG,
  PRODUCT_COUNT,
  SCENARIOS,
  TIMELINE_LIMIT,
  applyConfigChange,
  clearTimeline,
  createInitialState,
  deriveTopology,
  explain,
  formatSimTime,
  getScenario,
  parseResilienceParams,
  scenarioConfig,
  sendRequest,
  sendRequests,
  serializeResilienceParams,
  summarizeMetrics,
  type ResilienceConfig,
} from './index'

const cfg = (over: Partial<ResilienceConfig> = {}): ResilienceConfig => ({ ...DEFAULT_CONFIG, ...over })

describe('healthy system', () => {
  it('succeeds every request and walks the full path', () => {
    const s = sendRequest(createInitialState(), cfg())
    const trace = s.lastTrace!
    expect(trace.status).toBe('success')
    const hops = trace.steps.map((st) => `${st.from}>${st.to}`)
    expect(hops.slice(0, 3)).toEqual(['client>gateway', 'gateway>order', 'order>inventory'])
    expect(hops).toContain('order>payment')
    expect(hops).toContain('payment>paymentDb')
    expect(hops.slice(-2)).toEqual(['order>gateway', 'gateway>client'])
    expect(summarizeMetrics(s).availability).toBe(1)
  })

  it('is deterministic for the same seed and inputs', () => {
    const c = cfg({ packetLoss: 0.5, retryEnabled: true })
    const a = sendRequests(createInitialState(7), c, 20)
    const b = sendRequests(createInitialState(7), c, 20)
    expect(a.metrics).toEqual(b.metrics)
    expect(a.timeline).toEqual(b.timeline)
  })

  it('advances the simulated clock only when requests are sent', () => {
    const s = sendRequests(createInitialState(), cfg(), 3)
    expect(s.clock).toBe(3 * ARRIVAL_GAP_MS)
  })
})

describe('failed services', () => {
  it('fails requests that need a killed Payment Service', () => {
    const s = sendRequests(createInitialState(), cfg({ killed: ['payment'] }), 5)
    expect(s.metrics.failedRequests).toBe(5)
    expect(s.lastTrace!.failedAt).toBe('payment')
    expect(s.lastTrace!.steps.at(-1)!.badge).toBe('FAILED')
  })

  it('stops at the gateway when Order Service is down and never calls dependencies', () => {
    const s = sendRequests(createInitialState(), cfg({ killed: ['order'] }), 3)
    expect(s.metrics.failedRequests).toBe(3)
    expect(s.metrics.dependencyCalls).toEqual({ payment: 0, inventory: 0 })
    expect(s.lastTrace!.failedAt).toBe('order')
  })

  it('cascades a Payment Database failure through Payment Service', () => {
    const c = cfg({ killed: ['paymentDb'] })
    const s = sendRequest(createInitialState(), c)
    expect(s.lastTrace!.status).toBe('failed')
    expect(s.lastTrace!.failedAt).toBe('paymentDb')
    const topology = deriveTopology(c, s)
    expect(topology.nodes.paymentDb).toBe('failed')
    expect(topology.nodes.payment).toBe('degraded')
    expect(topology.nodes.client).toBe('failed')
  })

  it('times out a dependency slower than the timeout', () => {
    const s = sendRequest(createInitialState(), cfg({ slowdown: { inventory: 1200 }, timeoutMs: 1000 }))
    expect(s.lastTrace!.status).toBe('timeout')
    expect(s.metrics.timeouts).toBe(1)
    expect(s.lastTrace!.latency).toBeGreaterThanOrEqual(1000)
  })

  it('marks a restored service as recovering, then healthy', () => {
    const killed = cfg({ killed: ['payment'] })
    let s = sendRequest(createInitialState(), killed)
    s = applyConfigChange(s, killed, cfg())
    expect(deriveTopology(cfg(), s).nodes.payment).toBe('recovering')
    s = sendRequests(s, cfg(), 8)
    expect(deriveTopology(cfg(), s).nodes.payment).toBe('healthy')
  })
})

describe('retry', () => {
  it('retries a killed dependency maxRetries times and counts each attempt', () => {
    const s = sendRequest(createInitialState(), cfg({ killed: ['payment'], retryEnabled: true, maxRetries: 3 }))
    expect(s.lastTrace!.retries).toBe(3)
    expect(s.metrics.retryCount).toBe(3)
    expect(s.metrics.dependencyCalls.payment).toBe(4)
    expect(s.lastTrace!.steps.filter((st) => st.badge === 'RETRYING')).toHaveLength(3)
  })

  it('adds latency for every retry', () => {
    const without = sendRequest(createInitialState(), cfg({ killed: ['payment'] }))
    const withRetry = sendRequest(createInitialState(), cfg({ killed: ['payment'], retryEnabled: true, maxRetries: 2 }))
    expect(withRetry.lastTrace!.latency).toBeGreaterThan(without.lastTrace!.latency)
  })

  it('masks transient packet loss and raises availability', () => {
    const lossy = cfg({ packetLoss: 0.5 })
    const plain = summarizeMetrics(sendRequests(createInitialState(3), lossy, 40))
    const retried = summarizeMetrics(sendRequests(createInitialState(3), { ...lossy, retryEnabled: true, maxRetries: 3 }, 40))
    expect(retried.availability).toBeGreaterThan(plain.availability)
    expect(retried.retryCount).toBeGreaterThan(0)
    expect(retried.averageLatency).toBeGreaterThan(plain.averageLatency)
  })

  it('does not retry when disabled', () => {
    const s = sendRequests(createInitialState(), cfg({ killed: ['payment'] }), 3)
    expect(s.metrics.retryCount).toBe(0)
  })
})

describe('circuit breaker', () => {
  const breaker = cfg({ killed: ['payment'], circuitBreakerEnabled: true, failureThreshold: 3, recoveryMs: 2000 })

  it('opens after the failure threshold and then fails fast', () => {
    let s = sendRequests(createInitialState(), breaker, 2)
    expect(s.breakers.payment.state).toBe('closed')
    s = sendRequest(s, breaker)
    expect(s.breakers.payment.state).toBe('open')
    expect(s.lastTrace!.transitions).toContainEqual({ dependency: 'payment', to: 'open' })
    const callsBefore = s.metrics.dependencyCalls.payment
    s = sendRequest(s, breaker)
    expect(s.lastTrace!.status).toBe('circuit-open')
    expect(s.metrics.dependencyCalls.payment).toBe(callsBefore)
    expect(s.metrics.circuitRejections).toBe(1)
    expect(deriveTopology(breaker, s).nodes.payment).toBe('circuit-open')
  })

  it('goes HALF OPEN after the recovery time and back to OPEN on a failed trial', () => {
    let s = sendRequests(createInitialState(), breaker, 3) // opens at t=1500
    s = sendRequests(s, breaker, 3) // t=3000: still open
    expect(s.breakers.payment.state).toBe('open')
    s = sendRequest(s, breaker) // t=3500: 2000ms elapsed → half-open, trial fails
    expect(s.timeline.some((e) => e.text.includes('HALF OPEN'))).toBe(true)
    expect(s.breakers.payment.state).toBe('open')
    expect(s.lastTrace!.transitions).toContainEqual({ dependency: 'payment', to: 'open' })
  })

  it('closes after a successful trial once the service is back', () => {
    let s = sendRequests(createInitialState(), breaker, 3)
    const healed = { ...breaker, killed: [] }
    s = applyConfigChange(s, breaker, healed)
    s = sendRequests(s, healed, 3) // still open: rejected without calling
    expect(s.lastTrace!.status).toBe('circuit-open')
    s = sendRequest(s, healed) // half-open trial succeeds
    expect(s.breakers.payment.state).toBe('closed')
    expect(s.lastTrace!.status).toBe('success')
    expect(s.lastTrace!.transitions).toContainEqual({ dependency: 'payment', to: 'closed' })
  })

  it('stops retrying once the circuit opens mid-request', () => {
    const c = { ...breaker, retryEnabled: true, maxRetries: 3 as const }
    const s = sendRequest(createInitialState(), c)
    expect(s.breakers.payment.state).toBe('open')
    expect(s.metrics.dependencyCalls.payment).toBe(3)
  })
})

describe('cache', () => {
  const cached = cfg({ cacheEnabled: true })

  it('misses on first sight of a product and hits on repeats', () => {
    let s = sendRequests(createInitialState(), cached, PRODUCT_COUNT)
    expect(s.metrics.cacheMisses).toBe(PRODUCT_COUNT)
    expect(s.metrics.cacheHits).toBe(0)
    s = sendRequest(s, cached)
    expect(s.lastTrace!.cache).toBe('hit')
    expect(summarizeMetrics(s).cacheHitRate).toBeCloseTo(1 / (PRODUCT_COUNT + 1))
  })

  it('makes hits faster and skips the Inventory Service', () => {
    let s = sendRequests(createInitialState(), cached, PRODUCT_COUNT)
    const missLatency = s.lastTrace!.latency
    const inventoryCalls = s.metrics.dependencyCalls.inventory
    s = sendRequest(s, cached)
    expect(s.lastTrace!.latency).toBeLessThan(missLatency)
    expect(s.metrics.dependencyCalls.inventory).toBe(inventoryCalls)
  })

  it('keeps cached products orderable while Inventory is down', () => {
    let s = sendRequests(createInitialState(), cached, PRODUCT_COUNT)
    s = sendRequest(s, { ...cached, killed: ['inventory'] })
    expect(s.lastTrace!.status).toBe('success')
  })
})

describe('message queue', () => {
  const queued = cfg({ queueEnabled: true })

  it('accepts orders immediately and processes them later', () => {
    let s = sendRequest(createInitialState(), queued)
    expect(s.lastTrace!.status).toBe('accepted')
    expect(s.lastTrace!.steps.some((st) => st.to === 'queue')).toBe(true)
    expect(s.queue[0].status).toBe('queued')
    s = sendRequest(s, queued)
    expect(s.queue.find((m) => m.requestId === 1)!.status).toBe('processing')
    s = sendRequest(s, queued)
    expect(s.queue.find((m) => m.requestId === 1)!.status).toBe('completed')
    expect(summarizeMetrics(s).queue.completed).toBe(1)
  })

  it('keeps accepting orders while Payment is down and drains after restore', () => {
    const down = { ...queued, killed: ['payment' as const] }
    let s = sendRequests(createInitialState(), down, 5)
    expect(s.metrics.failedRequests).toBe(0)
    expect(s.queue.every((m) => m.status !== 'completed')).toBe(true)
    s = applyConfigChange(s, down, queued)
    s = sendRequests(s, queued, 6)
    expect(summarizeMetrics(s).queue.completed).toBeGreaterThanOrEqual(5)
  })

  it('shows the queue path instead of direct calls', () => {
    const s = sendRequest(createInitialState(), queued)
    const t = deriveTopology(queued, s)
    expect(t.edges['order-queue']).toBe('queued')
    expect(t.edges['order-payment']).toBeUndefined()
  })
})

describe('metrics and timeline', () => {
  it('computes availability, average latency and totals', () => {
    let s = sendRequests(createInitialState(), cfg(), 3)
    s = sendRequest(s, cfg({ killed: ['payment'] }))
    const m = summarizeMetrics(s)
    expect(m.totalRequests).toBe(4)
    expect(m.successfulRequests).toBe(3)
    expect(m.failedRequests).toBe(1)
    expect(m.availability).toBe(0.75)
    expect(m.averageLatency).toBeCloseTo(s.metrics.latencySum / 4)
  })

  it('reports 100% availability and zero latency before any request', () => {
    const m = summarizeMetrics(createInitialState())
    expect(m.availability).toBe(1)
    expect(m.averageLatency).toBe(0)
    expect(m.cacheHitRate).toBe(0)
  })

  it('caps the timeline and can clear it without touching metrics', () => {
    let s = sendRequests(createInitialState(), cfg(), 20)
    expect(s.timeline).toHaveLength(TIMELINE_LIMIT)
    expect(s.timeline[0].id).toBeGreaterThan(s.timeline[1].id)
    s = clearTimeline(s)
    expect(s.timeline).toHaveLength(0)
    expect(s.metrics.totalRequests).toBe(20)
  })

  it('logs configuration changes', () => {
    const s = applyConfigChange(createInitialState(), cfg(), cfg({ killed: ['payment'], retryEnabled: true }))
    const texts = s.timeline.map((e) => e.text)
    expect(texts).toContain('Payment Service killed')
    expect(texts).toContain('Retry enabled')
  })

  it('formats simulated time as a clock', () => {
    expect(formatSimTime(0)).toBe('12:00:00.0')
    expect(formatSimTime(61_500)).toBe('12:01:01.5')
  })
})

describe('reset', () => {
  it('a fresh state and the default config restore everything', () => {
    const fresh = createInitialState()
    expect(fresh.metrics.totalRequests).toBe(0)
    expect(fresh.timeline).toEqual([])
    expect(fresh.queue).toEqual([])
    expect(fresh.breakers.payment.state).toBe('closed')
    expect(DEFAULT_CONFIG).toMatchObject({
      killed: [],
      latencyMs: 0,
      packetLoss: 0,
      retryEnabled: false,
      circuitBreakerEnabled: false,
      cacheEnabled: false,
      queueEnabled: false,
    })
    const topology = deriveTopology(DEFAULT_CONFIG, fresh)
    expect(Object.values(topology.nodes).every((st) => st === 'healthy')).toBe(true)
  })

  it('explains a reset', () => {
    expect(explain(DEFAULT_CONFIG, createInitialState(), { kind: 'reset' }).tone).toBe('healthy')
  })
})

describe('scenarios', () => {
  it('each scenario injects its failure', () => {
    expect(scenarioConfig(getScenario('payment-outage')!).killed).toEqual(['payment'])
    expect(scenarioConfig(getScenario('inventory-slowdown')!).slowdown.inventory).toBe(1200)
    expect(scenarioConfig(getScenario('network-instability')!).packetLoss).toBe(0.5)
    expect(scenarioConfig(getScenario('database-failure')!).killed).toEqual(['paymentDb'])
  })

  it('every scenario degrades a fresh system', () => {
    for (const scenario of SCENARIOS) {
      const s = sendRequests(createInitialState(), scenarioConfig(scenario), 10)
      expect(summarizeMetrics(s).availability, scenario.id).toBeLessThan(1)
    }
  })

  it('keeps the enabled mechanisms when loading a scenario', () => {
    const c = scenarioConfig(getScenario('payment-outage')!, cfg({ retryEnabled: true, latencyMs: 500 }))
    expect(c.retryEnabled).toBe(true)
    expect(c.latencyMs).toBe(0)
  })
})

describe('url state', () => {
  it('parses a shared link', () => {
    const { scenarioId, config } = parseResilienceParams(
      new URLSearchParams('scenario=payment-outage&retry=true&circuitBreaker=true'),
    )
    expect(scenarioId).toBe('payment-outage')
    expect(config.killed).toEqual(['payment'])
    expect(config.retryEnabled).toBe(true)
    expect(config.circuitBreakerEnabled).toBe(true)
  })

  it('ignores invalid values', () => {
    const { scenarioId, config } = parseResilienceParams(new URLSearchParams('scenario=nope&latency=42&kill=payment,bogus'))
    expect(scenarioId).toBeNull()
    expect(config.latencyMs).toBe(0)
    expect(config.killed).toEqual(['payment'])
  })

  it('round-trips and omits defaults', () => {
    expect(serializeResilienceParams({ scenarioId: null, config: DEFAULT_CONFIG }).toString()).toBe('')
    const state = {
      scenarioId: 'database-failure' as const,
      config: { ...scenarioConfig(getScenario('database-failure')!), cacheEnabled: true },
    }
    const params = serializeResilienceParams(state)
    expect(params.toString()).toBe('scenario=database-failure&cache=true')
    expect(parseResilienceParams(params)).toEqual(state)
  })
})
