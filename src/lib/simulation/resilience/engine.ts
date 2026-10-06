import { Rng } from '@/lib/random'
import {
  DEPENDENCIES,
  SERVICE_LABELS,
  type Breaker,
  type DependencyId,
  type EventTone,
  type KillableService,
  type NodeId,
  type RequestBadge,
  type RequestStatus,
  type RequestTrace,
  type ResilienceConfig,
  type ResilienceMetrics,
  type ResilienceState,
  type StepKind,
} from './types'

/**
 * Resilience playground simulation.
 *
 * Requests are processed one at a time, only when the visitor sends them.
 * Each request advances a simulated clock by ARRIVAL_GAP_MS, which drives
 * circuit-breaker recovery, cache expiry, service warm-up and queue draining.
 * Packet loss uses a seeded PRNG, so the same seed, configuration and
 * sequence of actions always reproduce the same run.
 */

export const ARRIVAL_GAP_MS = 500
export const TIMELINE_LIMIT = 30
export const RECENT_LIMIT = 30
export const QUEUE_LIMIT = 24
/** Messages the queue consumers pick up per arrival. */
export const QUEUE_THROUGHPUT = 2
/** Distinct products; requests cycle through them, so cache hits are predictable. */
export const PRODUCT_COUNT = 4
export const CACHE_TTL_MS = 6000
/** Warm-up after a restore: calls are slower while the service recovers. */
export const WARMUP_MS = 3000

export const LATENCY = {
  edgeHop: 10,
  service: { payment: 60, inventory: 40 } as Record<DependencyId, number>,
  database: 15,
  /** Payment Service waits this long for a dead database before failing. */
  databaseTimeout: 300,
  connectionRefused: 5,
  circuitRejection: 1,
  cacheLookup: 2,
  enqueue: 4,
  warmup: 150,
  /** Base backoff before each retry, multiplied by the attempt number. */
  backoff: 100,
} as const

export const DEFAULT_CONFIG: ResilienceConfig = {
  killed: [],
  latencyMs: 0,
  packetLoss: 0,
  slowdown: {},
  timeoutMs: 1000,
  retryEnabled: false,
  maxRetries: 2,
  circuitBreakerEnabled: false,
  failureThreshold: 3,
  recoveryMs: 5000,
  cacheEnabled: false,
  queueEnabled: false,
}

function emptyMetrics(): ResilienceMetrics {
  return {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    timeouts: 0,
    circuitRejections: 0,
    latencySum: 0,
    retryCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    dependencyCalls: { payment: 0, inventory: 0 },
  }
}

const closedBreaker = (): Breaker => ({ state: 'closed', consecutiveFailures: 0, openedAt: 0 })

export function createInitialState(seed = 1): ResilienceState {
  return {
    seed,
    clock: 0,
    nextRequestId: 1,
    nextEventId: 1,
    nextMessageId: 1,
    breakers: { payment: closedBreaker(), inventory: closedBreaker() },
    cache: {},
    queue: [],
    completedMessages: 0,
    recoveringUntil: {},
    metrics: emptyMetrics(),
    recent: [],
    timeline: [],
    lastTrace: null,
  }
}

const label = (id: NodeId) => SERVICE_LABELS[id]
const isKilled = (config: ResilienceConfig, id: KillableService) => config.killed.includes(id)

function pushEvent(state: ResilienceState, text: string, tone: EventTone, requestId?: number) {
  state.timeline = [{ id: state.nextEventId++, t: state.clock, requestId, text, tone }, ...state.timeline].slice(0, TIMELINE_LIMIT)
}

/** Clears the timeline without touching metrics or service state. */
export function clearTimeline(state: ResilienceState): ResilienceState {
  return { ...state, timeline: [] }
}

/**
 * Records what a configuration change did to the running system: restored
 * services start warming up, and every change lands on the timeline.
 */
export function applyConfigChange(state: ResilienceState, prev: ResilienceConfig, next: ResilienceConfig): ResilienceState {
  const s = structuredClone(state)
  for (const id of next.killed) {
    if (!prev.killed.includes(id)) pushEvent(s, `${label(id)} killed`, 'failed')
  }
  for (const id of prev.killed) {
    if (!next.killed.includes(id)) {
      s.recoveringUntil[id] = s.clock + WARMUP_MS
      pushEvent(s, `${label(id)} restored, warming up`, 'info')
    }
  }
  if (prev.latencyMs !== next.latencyMs) pushEvent(s, `Network latency set to +${next.latencyMs} ms`, next.latencyMs ? 'warning' : 'neutral')
  if (prev.packetLoss !== next.packetLoss)
    pushEvent(s, `Packet loss set to ${Math.round(next.packetLoss * 100)}%`, next.packetLoss ? 'warning' : 'neutral')
  for (const dep of DEPENDENCIES) {
    if ((prev.slowdown[dep] ?? 0) !== (next.slowdown[dep] ?? 0))
      pushEvent(s, `${label(dep)} slowdown +${next.slowdown[dep] ?? 0} ms`, next.slowdown[dep] ? 'warning' : 'neutral')
  }
  if (prev.timeoutMs !== next.timeoutMs) pushEvent(s, `Timeout set to ${next.timeoutMs} ms`, 'neutral')
  const toggles: Array<[keyof ResilienceConfig, string]> = [
    ['retryEnabled', 'Retry'],
    ['circuitBreakerEnabled', 'Circuit breaker'],
    ['cacheEnabled', 'Redis cache'],
    ['queueEnabled', 'Message queue'],
  ]
  for (const [key, name] of toggles) {
    if (prev[key] !== next[key]) pushEvent(s, `${name} ${next[key] ? 'enabled' : 'disabled'}`, 'info')
  }
  if (prev.maxRetries !== next.maxRetries) pushEvent(s, `Max retries set to ${next.maxRetries}`, 'neutral')
  if (prev.failureThreshold !== next.failureThreshold) pushEvent(s, `Failure threshold set to ${next.failureThreshold}`, 'neutral')
  if (prev.recoveryMs !== next.recoveryMs) pushEvent(s, `Recovery time set to ${next.recoveryMs / 1000} s`, 'neutral')
  // Turning the breaker off forgets its state; turning it on starts closed.
  if (prev.circuitBreakerEnabled !== next.circuitBreakerEnabled) {
    s.breakers = { payment: closedBreaker(), inventory: closedBreaker() }
  }
  return s
}

/** Moves queued work forward: processing messages finish, queued ones start. */
function processQueue(state: ResilienceState, config: ResilienceConfig) {
  const blocker = (['inventory', 'payment', 'paymentDb'] as KillableService[]).find((id) => isKilled(config, id))
  for (const msg of state.queue) {
    if (msg.status !== 'processing') continue
    msg.attempts++
    if (blocker) {
      msg.status = 'queued'
      msg.waitingOn = blocker
    } else {
      msg.status = 'completed'
      msg.waitingOn = undefined
      state.completedMessages++
      pushEvent(state, `Order #${msg.requestId} fulfilled asynchronously`, 'success', msg.requestId)
    }
  }
  let started = 0
  for (const msg of state.queue) {
    if (started >= QUEUE_THROUGHPUT) break
    // Consumers back off while a dependency they need is down.
    if (msg.status === 'queued' && (!blocker || msg.waitingOn === undefined)) {
      msg.status = 'processing'
      started++
    }
  }
  // Keep pending work, plus the most recent completed messages for display.
  const pending = state.queue.filter((m) => m.status !== 'completed')
  const completed = state.queue.filter((m) => m.status === 'completed').slice(-Math.max(0, QUEUE_LIMIT - pending.length))
  state.queue = [...pending, ...completed].sort((a, b) => a.id - b.id).slice(-Math.max(QUEUE_LIMIT, pending.length))
}

/** Advances breakers whose recovery period has elapsed: OPEN → HALF OPEN. */
function tickBreakers(state: ResilienceState, config: ResilienceConfig) {
  if (!config.circuitBreakerEnabled) return
  for (const dep of DEPENDENCIES) {
    const b = state.breakers[dep]
    if (b.state === 'open' && state.clock - b.openedAt >= config.recoveryMs) {
      b.state = 'half-open'
      pushEvent(state, `Circuit breaker HALF OPEN (${label(dep)}): next call is a trial`, 'warning')
    }
  }
}

interface AttemptResult {
  ok: boolean
  kind: StepKind
  latency: number
  label: string
  /** Node where the failure happened, when it is not the dependency itself. */
  failedAt?: NodeId
}

/** One network call from the Order Service to a dependency. */
function attempt(dep: DependencyId, config: ResilienceConfig, state: ResilienceState, rng: Rng): AttemptResult {
  if (isKilled(config, dep)) {
    return { ok: false, kind: 'failed', latency: LATENCY.connectionRefused, label: `${label(dep)} unavailable (connection refused)` }
  }
  // Dropped packets: the caller hears nothing back and waits for the timeout.
  if (config.packetLoss > 0 && rng.chance(config.packetLoss)) {
    return { ok: false, kind: 'timeout', latency: config.timeoutMs, label: `Request to ${label(dep)} dropped by the network` }
  }
  let latency = LATENCY.service[dep] + config.latencyMs + (config.slowdown[dep] ?? 0)
  const warming = state.recoveringUntil[dep]
  if (warming !== undefined && state.clock < warming) latency += LATENCY.warmup

  if (dep === 'payment' && isKilled(config, 'paymentDb')) {
    const waited = Math.min(latency + LATENCY.databaseTimeout, config.timeoutMs)
    return { ok: false, kind: 'failed', latency: waited, label: 'Payment Database unavailable: Payment Service returned 500', failedAt: 'paymentDb' }
  }
  latency += LATENCY.database
  if (latency > config.timeoutMs) {
    return { ok: false, kind: 'timeout', latency: config.timeoutMs, label: `${label(dep)} TIMEOUT after ${config.timeoutMs} ms` }
  }
  return { ok: true, kind: 'response', latency, label: `${label(dep)} responded in ${latency} ms` }
}

interface CallResult {
  ok: boolean
  status: RequestStatus
  failedAt?: NodeId
}

/**
 * Calls a dependency through the resilience mechanisms: circuit breaker
 * first, then up to 1 + maxRetries attempts with linear backoff.
 */
function callDependency(
  dep: DependencyId,
  config: ResilienceConfig,
  state: ResilienceState,
  rng: Rng,
  trace: RequestTrace,
): CallResult {
  const breaker = state.breakers[dep]
  const db: NodeId = dep === 'payment' ? 'paymentDb' : 'inventoryDb'
  const rid = trace.requestId

  if (config.circuitBreakerEnabled && breaker.state === 'open') {
    trace.latency += LATENCY.circuitRejection
    trace.steps.push({ from: 'order', to: dep, kind: 'circuit-open', badge: 'CIRCUIT OPEN', label: `Circuit open: call to ${label(dep)} rejected` })
    pushEvent(state, `Circuit OPEN: ${label(dep)} call failed fast`, 'warning', rid)
    state.metrics.circuitRejections++
    return { ok: false, status: 'circuit-open', failedAt: dep }
  }

  const trial = config.circuitBreakerEnabled && breaker.state === 'half-open'
  const attempts = trial ? 1 : 1 + (config.retryEnabled ? config.maxRetries : 0)
  let last: AttemptResult | null = null

  for (let n = 1; n <= attempts; n++) {
    if (n > 1) {
      trace.retries++
      state.metrics.retryCount++
      trace.latency += LATENCY.backoff * (n - 1)
      trace.steps.push({ from: 'order', to: dep, kind: 'retry', badge: 'RETRYING', label: `Retry attempt #${n - 1} to ${label(dep)}` })
      pushEvent(state, `Retry attempt #${n - 1} → ${label(dep)}`, 'warning', rid)
    } else {
      trace.steps.push({ from: 'order', to: dep, kind: 'request', badge: 'IN FLIGHT', label: `Order Service → ${label(dep)}` })
      pushEvent(state, `Order Service → ${label(dep)}${trial ? ' (trial call)' : ''}`, 'neutral', rid)
    }
    state.metrics.dependencyCalls[dep]++

    last = attempt(dep, config, state, rng)
    trace.latency += last.latency

    if (last.ok) {
      trace.steps.push({ from: dep, to: db, kind: 'request', badge: 'IN FLIGHT', label: `${label(dep)} → ${label(db)}` })
      trace.steps.push({ from: db, to: dep, kind: 'response', badge: 'IN FLIGHT', label: `${label(db)} OK` })
      trace.steps.push({ from: dep, to: 'order', kind: 'response', badge: 'IN FLIGHT', label: last.label })
      if (config.circuitBreakerEnabled) {
        if (breaker.state === 'half-open') {
          breaker.state = 'closed'
          trace.transitions.push({ dependency: dep, to: 'closed' })
          pushEvent(state, `Circuit breaker CLOSED (${label(dep)}): trial call succeeded`, 'success', rid)
        }
        breaker.consecutiveFailures = 0
      }
      return { ok: true, status: 'success' }
    }

    // Failure: draw where it broke.
    if (last.failedAt === 'paymentDb') {
      trace.steps.push({ from: dep, to: db, kind: 'failed', badge: 'FAILED', label: last.label })
    } else {
      trace.steps.push({
        from: 'order',
        to: dep,
        kind: last.kind,
        badge: last.kind === 'timeout' ? 'TIMEOUT' : 'FAILED',
        label: last.label,
      })
    }
    pushEvent(state, last.label, last.kind === 'timeout' ? 'warning' : 'failed', rid)

    if (config.circuitBreakerEnabled) {
      breaker.consecutiveFailures++
      const shouldOpen = breaker.state === 'half-open' || breaker.consecutiveFailures >= config.failureThreshold
      if (shouldOpen) {
        breaker.state = 'open'
        breaker.openedAt = state.clock
        trace.transitions.push({ dependency: dep, to: 'open' })
        pushEvent(state, `Circuit breaker OPEN (${label(dep)})`, 'failed', rid)
        break // Remaining retries would be rejected anyway.
      }
    }
  }

  const status: RequestStatus = last?.kind === 'timeout' ? 'timeout' : 'failed'
  return { ok: false, status, failedAt: last?.failedAt ?? dep }
}

const BADGE: Record<RequestStatus, RequestBadge> = {
  success: 'SUCCESS',
  accepted: 'ACCEPTED',
  failed: 'FAILED',
  timeout: 'TIMEOUT',
  'circuit-open': 'CIRCUIT OPEN',
}

/** Sends one order request through the system. Pure: returns a new state. */
export function sendRequest(prev: ResilienceState, config: ResilienceConfig): ResilienceState {
  const state = structuredClone(prev)
  const rng = new Rng(state.seed)
  state.clock += ARRIVAL_GAP_MS
  tickBreakers(state, config)
  processQueue(state, config)

  const requestId = state.nextRequestId++
  const sku = `sku-${(requestId % PRODUCT_COUNT) + 1}`
  const trace: RequestTrace = { requestId, sku, status: 'success', latency: 0, retries: 0, steps: [], transitions: [] }
  state.metrics.totalRequests++

  const finish = (status: RequestStatus, failedAt?: NodeId) => {
    trace.status = status
    trace.failedAt = failedAt
    const ok = status === 'success' || status === 'accepted'
    const back: Array<[NodeId, NodeId]> = [
      ['order', 'gateway'],
      ['gateway', 'client'],
    ]
    for (const [from, to] of back) {
      trace.steps.push({ from, to, kind: ok ? 'response' : 'failed', badge: BADGE[status], label: ok ? `${label(from)} → ${label(to)}` : `Error returned to ${label(to)}` })
    }
    trace.latency += LATENCY.edgeHop * 2
    if (ok) state.metrics.successfulRequests++
    else state.metrics.failedRequests++
    if (status === 'timeout') state.metrics.timeouts++
    state.metrics.latencySum += trace.latency
    state.recent = [...state.recent, { requestId, latency: trace.latency, ok }].slice(-RECENT_LIMIT)
    const verdict = status === 'accepted' ? 'ACCEPTED (202, fulfilment queued)' : BADGE[status]
    pushEvent(state, `Request #${requestId} ${verdict} in ${trace.latency} ms`, ok ? 'success' : 'failed', requestId)
    state.lastTrace = trace
    state.seed = rng.seed
    return state
  }

  pushEvent(state, `Request #${requestId} · Client → API Gateway`, 'neutral', requestId)
  trace.steps.push({ from: 'client', to: 'gateway', kind: 'request', badge: 'IN FLIGHT', label: 'Client → API Gateway' })
  trace.latency += LATENCY.edgeHop + config.latencyMs / 2

  pushEvent(state, 'API Gateway → Order Service', 'neutral', requestId)
  if (isKilled(config, 'order')) {
    trace.steps.push({ from: 'gateway', to: 'order', kind: 'failed', badge: 'FAILED', label: 'Order Service unavailable' })
    pushEvent(state, 'Order Service unavailable (503)', 'failed', requestId)
    trace.latency += LATENCY.connectionRefused
    // Without the Order Service there is nothing to unwind past the gateway.
    trace.status = 'failed'
    trace.failedAt = 'order'
    trace.steps.push({ from: 'gateway', to: 'client', kind: 'failed', badge: 'FAILED', label: 'Error returned to Client' })
    state.metrics.failedRequests++
    state.metrics.latencySum += trace.latency
    state.recent = [...state.recent, { requestId, latency: trace.latency, ok: false }].slice(-RECENT_LIMIT)
    pushEvent(state, `Request #${requestId} FAILED in ${trace.latency} ms`, 'failed', requestId)
    state.lastTrace = trace
    state.seed = rng.seed
    return state
  }
  trace.steps.push({ from: 'gateway', to: 'order', kind: 'request', badge: 'IN FLIGHT', label: 'API Gateway → Order Service' })
  trace.latency += LATENCY.edgeHop

  // Asynchronous mode: accept the order and let queue consumers fulfil it.
  if (config.queueEnabled) {
    state.queue.push({ id: state.nextMessageId++, requestId, status: 'queued', attempts: 0 })
    trace.latency += LATENCY.enqueue
    trace.steps.push({ from: 'order', to: 'queue', kind: 'enqueue', badge: 'IN FLIGHT', label: `Order #${requestId} queued` })
    pushEvent(state, `Order #${requestId} queued for payment and inventory`, 'info', requestId)
    return finish('accepted')
  }

  // Inventory: a cache hit answers the stock check without calling the service.
  let stockKnown = false
  if (config.cacheEnabled) {
    trace.latency += LATENCY.cacheLookup
    const expires = state.cache[sku]
    if (expires !== undefined && expires > state.clock) {
      stockKnown = true
      trace.cache = 'hit'
      state.metrics.cacheHits++
      trace.steps.push({ from: 'order', to: 'cache', kind: 'cache-hit', badge: 'IN FLIGHT', label: `Cache HIT: stock for ${sku}` })
      trace.steps.push({ from: 'cache', to: 'order', kind: 'response', badge: 'IN FLIGHT', label: 'Stock read from Redis' })
      pushEvent(state, `Cache HIT ${sku}: Inventory Service not called`, 'info', requestId)
    } else {
      trace.cache = 'miss'
      state.metrics.cacheMisses++
      trace.steps.push({ from: 'order', to: 'cache', kind: 'cache-miss', badge: 'IN FLIGHT', label: `Cache MISS: ${sku}` })
      pushEvent(state, `Cache MISS ${sku}`, 'neutral', requestId)
    }
  }
  if (!stockKnown) {
    const inv = callDependency('inventory', config, state, rng, trace)
    if (!inv.ok) return finish(inv.status, inv.failedAt)
    if (config.cacheEnabled) state.cache[sku] = state.clock + CACHE_TTL_MS
  }

  const pay = callDependency('payment', config, state, rng, trace)
  if (!pay.ok) return finish(pay.status, pay.failedAt)
  return finish('success')
}

/** Sends `count` requests back to back. */
export function sendRequests(state: ResilienceState, config: ResilienceConfig, count: number): ResilienceState {
  let s = state
  for (let i = 0; i < count; i++) s = sendRequest(s, config)
  return s
}

/** Display-ready metrics derived from raw counters. */
export function summarizeMetrics(state: ResilienceState) {
  const m = state.metrics
  const lookups = m.cacheHits + m.cacheMisses
  return {
    totalRequests: m.totalRequests,
    successfulRequests: m.successfulRequests,
    failedRequests: m.failedRequests,
    availability: m.totalRequests ? m.successfulRequests / m.totalRequests : 1,
    averageLatency: m.totalRequests ? m.latencySum / m.totalRequests : 0,
    retryCount: m.retryCount,
    cacheHitRate: lookups ? m.cacheHits / lookups : 0,
    cacheLookups: lookups,
    timeouts: m.timeouts,
    circuitRejections: m.circuitRejections,
    /** Calls per request reaching Payment; above 1 means retries amplify traffic. */
    paymentAmplification: m.totalRequests ? m.dependencyCalls.payment / m.totalRequests : 0,
    queue: {
      queued: state.queue.filter((q) => q.status === 'queued').length,
      processing: state.queue.filter((q) => q.status === 'processing').length,
      completed: state.completedMessages,
    },
  }
}

export type ResilienceSummary = ReturnType<typeof summarizeMetrics>

/** Simulated wall clock starts at 12:00:00 so the timeline reads like a real log. */
const CLOCK_ORIGIN_S = 12 * 3600

/** Formats simulated time as HH:MM:SS.s for the timeline. */
export function formatSimTime(ms: number): string {
  const total = CLOCK_ORIGIN_S + ms / 1000
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${sec.toFixed(1).padStart(4, '0')}`
}
