import { summarizeMetrics } from './engine'
import { getScenario, type ScenarioId } from './scenarios'
import {
  DEPENDENCIES,
  SERVICE_LABELS,
  type KillableService,
  type RequestTrace,
  type ResilienceConfig,
  type ResilienceState,
} from './types'

export type Mechanism = 'retry' | 'circuitBreaker' | 'cache' | 'queue'

/** What the visitor did last; the explanation is written about it. */
export type ResilienceAction =
  | { kind: 'kill'; service: KillableService }
  | { kind: 'restore'; service: KillableService | 'all' }
  | { kind: 'latency' }
  | { kind: 'packetLoss' }
  | { kind: 'timeout' }
  | { kind: 'mechanism'; mechanism: Mechanism; enabled: boolean }
  | { kind: 'setting'; key: 'maxRetries' | 'failureThreshold' | 'recoveryMs' }
  | { kind: 'request'; count: number }
  | { kind: 'scenario'; id: ScenarioId }
  | { kind: 'reset' }

export type Tone = 'healthy' | 'warning' | 'failed'

export interface Explanation {
  tone: Tone
  headline: string
  details: string[]
  /** The trade-off the last change introduced, if any. */
  tradeoff?: string
}

export const MECHANISM_TRADEOFFS: Record<Mechanism, string> = {
  retry:
    'Retries improve resilience against transient failures but can increase latency and amplify traffic during sustained outages.',
  circuitBreaker: 'A circuit breaker prevents cascading failures, but some requests fail fast while the dependency is unhealthy.',
  cache: 'Cache reduces pressure on downstream services but introduces consistency and invalidation concerns.',
  queue: 'Asynchronous processing improves resilience and decoupling but introduces eventual consistency.',
}

const label = (id: keyof typeof SERVICE_LABELS) => SERVICE_LABELS[id]

/** One-line consequences of the current configuration, used as supporting detail. */
function systemNotes(config: ResilienceConfig, state: ResilienceState): string[] {
  const notes: string[] = []
  const killed = config.killed
  if (killed.includes('order')) {
    notes.push('Order Service is down, so the API Gateway has nothing to route orders to. No mechanism behind it can help.')
  }
  if (killed.includes('paymentDb')) {
    notes.push(
      'Payment Database is down. Payment Service is running but every charge fails, so the failure cascades up to the client.',
    )
  }
  for (const dep of DEPENDENCIES) {
    if (killed.includes(dep)) notes.push(`${label(dep)} is unavailable. Orders that need it cannot complete synchronously.`)
    const slow = config.slowdown[dep] ?? 0
    if (slow) notes.push(`${label(dep)} needs ${slow} ms extra, so calls run past the ${config.timeoutMs} ms timeout.`)
  }
  if (config.latencyMs) notes.push(`Every hop pays +${config.latencyMs} ms of network latency.`)
  if (config.packetLoss)
    notes.push(
      `${Math.round(config.packetLoss * 100)}% of calls are dropped and only fail after the ${config.timeoutMs} ms timeout.`,
    )
  if (config.queueEnabled) {
    const { queued, processing } = summarizeMetrics(state).queue
    if (queued + processing > 0) notes.push(`${queued + processing} orders are waiting in the queue for asynchronous fulfilment.`)
  }
  return notes
}

function explainRequest(trace: RequestTrace, config: ResilienceConfig, state: ResilienceState): Explanation {
  const opened = trace.transitions.find((t) => t.to === 'open')
  const closed = trace.transitions.find((t) => t.to === 'closed')
  const notes = systemNotes(config, state)

  if (opened) {
    return {
      tone: 'failed',
      headline:
        'The circuit breaker detected repeated failures and opened the circuit. Requests are now failing fast instead of waiting for the unhealthy service.',
      details: [
        `${label(opened.dependency)} failed ${config.failureThreshold} times in a row. For the next ${config.recoveryMs / 1000} s the Order Service rejects calls to it immediately.`,
        'After the recovery time the circuit goes HALF OPEN and lets one trial request through.',
      ],
      tradeoff: MECHANISM_TRADEOFFS.circuitBreaker,
    }
  }
  if (closed) {
    return {
      tone: 'healthy',
      headline: `The trial request to ${label(closed.dependency)} succeeded, so the circuit breaker CLOSED again.`,
      details: ['Normal traffic resumes. The failure counter starts again from zero.', ...notes.slice(0, 1)],
    }
  }

  const retried = trace.retries > 0 ? ` after ${trace.retries} ${trace.retries === 1 ? 'retry' : 'retries'}` : ''
  switch (trace.status) {
    case 'success': {
      const details: string[] = []
      if (trace.retries) {
        details.push(
          `Retries masked a transient failure, but they added latency and ${trace.retries} extra ${trace.retries === 1 ? 'call' : 'calls'} downstream.`,
        )
      }
      if (trace.cache === 'hit') {
        details.push(
          'Cache hits are reducing requests to the downstream service and lowering simulated latency. Inventory Service was not called.',
        )
      } else if (trace.cache === 'miss') {
        details.push(
          `Cache MISS: stock for ${trace.sku} was fetched from Inventory and stored, so the next request for it will be a hit.`,
        )
      }
      return {
        tone: notes.length ? 'warning' : 'healthy',
        headline: `Request #${trace.requestId} succeeded in ${trace.latency} ms${retried}.`,
        details: [...details, ...notes].slice(0, 3),
      }
    }
    case 'accepted':
      return {
        tone: 'healthy',
        headline: `Order #${trace.requestId} was accepted in ${trace.latency} ms and queued for payment and inventory.`,
        details: [
          'The client gets an immediate answer. Queue consumers charge the payment and reserve stock later.',
          ...(notes.length ? notes : ['If a dependency goes down, messages wait in the queue instead of failing the order.']),
        ].slice(0, 3),
        tradeoff: MECHANISM_TRADEOFFS.queue,
      }
    case 'circuit-open':
      return {
        tone: 'warning',
        headline: `Request #${trace.requestId} failed fast in ${trace.latency} ms: the circuit to ${label(trace.failedAt ?? 'payment')} is OPEN.`,
        details: [
          'The Order Service did not wait for the unhealthy service, so threads and connections stay free for other work.',
          ...notes,
        ].slice(0, 3),
      }
    case 'timeout':
      return {
        tone: 'failed',
        headline: `Request #${trace.requestId} TIMED OUT after ${trace.latency} ms${retried}.`,
        details: [
          `The Order Service waited the full ${config.timeoutMs} ms timeout for ${label(trace.failedAt ?? 'payment')} before giving up.`,
          ...(config.retryEnabled ? ['Each retry waited for another full timeout, which is why the request took so long.'] : []),
          ...notes,
        ].slice(0, 3),
      }
    default: {
      const where = trace.failedAt ?? 'payment'
      let headline = `Request #${trace.requestId} FAILED${retried}.`
      if (where === 'payment') headline = 'Payment Service is unavailable. Requests requiring payment are now failing.'
      if (where === 'inventory') headline = 'Inventory Service is unavailable. Orders cannot check stock, so they are failing.'
      if (where === 'order') headline = 'Order Service is down. The API Gateway returns 503 for every order.'
      if (where === 'paymentDb')
        headline = 'Payment Database is down, and the failure cascaded through Payment Service to the client.'
      return {
        tone: 'failed',
        headline,
        details: [
          ...(trace.retries
            ? [`${trace.retries} retries could not help: the outage is not transient, and each retry added load and latency.`]
            : []),
          ...notes,
        ].slice(0, 3),
      }
    }
  }
}

/**
 * "What just happened?": explains the visitor's last action in terms of
 * what it did to the system. Rule-based; each branch maps to one cause.
 */
export function explain(config: ResilienceConfig, state: ResilienceState, action: ResilienceAction | null): Explanation {
  const notes = systemNotes(config, state)

  if (!action) {
    return {
      tone: 'healthy',
      headline: 'All services are healthy. Send a request to watch it travel through the system.',
      details: ['Then break something in Failure Injection, and turn on Resilience Mechanisms to see what they change.'],
    }
  }

  switch (action.kind) {
    case 'request':
      return state.lastTrace ? explainRequest(state.lastTrace, config, state) : explain(config, state, null)
    case 'kill': {
      const s = action.service
      const headline =
        s === 'payment'
          ? 'Payment Service is unavailable. Requests requiring payment are now failing.'
          : s === 'inventory'
            ? 'Inventory Service is unavailable. Orders cannot check stock, so they are now failing.'
            : s === 'order'
              ? 'Order Service is unavailable. Every order fails at the API Gateway.'
              : 'Payment Database is unavailable. Payment Service is up but cannot charge anyone.'
      const hints: string[] = []
      if (s === 'payment' || s === 'paymentDb') {
        if (!config.circuitBreakerEnabled) hints.push('Enable the circuit breaker to stop waiting on it.')
        if (!config.queueEnabled) hints.push('Enable the message queue to keep accepting orders while it is down.')
      }
      if (s === 'inventory' && !config.cacheEnabled)
        hints.push('Enable the cache: products already in Redis can still be ordered.')
      return {
        tone: 'failed',
        headline,
        details: [...notes.filter((n) => !n.startsWith(label(s))), ...hints, 'Send requests to see the effect.'].slice(0, 3),
      }
    }
    case 'restore':
      return {
        tone: config.killed.length ? 'warning' : 'healthy',
        headline:
          action.service === 'all'
            ? 'All services are restored and warming up.'
            : `${label(action.service)} is restored and warming up.`,
        details: [
          'A restarted service is slower for a few seconds while caches and connection pools fill. It shows as Recovering.',
          ...(config.circuitBreakerEnabled
            ? ['An open circuit stays open until its recovery time passes and a trial request succeeds.']
            : []),
          ...(config.queueEnabled ? ['Queued orders resume processing as more requests arrive.'] : []),
        ],
      }
    case 'latency':
      return {
        tone: config.latencyMs ? 'warning' : 'healthy',
        headline: config.latencyMs
          ? `Every network hop is now ${config.latencyMs} ms slower.`
          : 'Network latency is back to normal.',
        details: config.latencyMs
          ? [
              'Latency adds up across hops: one order makes several calls, so the client sees several times the delay.',
              ...(config.latencyMs >= config.timeoutMs - 100 ? [`Calls now run into the ${config.timeoutMs} ms timeout.`] : []),
              ...(config.cacheEnabled ? [] : ['A cache removes hops, which removes their latency.']),
            ]
          : notes.slice(0, 2),
      }
    case 'packetLoss':
      return {
        tone: config.packetLoss ? 'warning' : 'healthy',
        headline: config.packetLoss
          ? `${Math.round(config.packetLoss * 100)}% of service calls are now dropped by the network.`
          : 'The network stopped dropping requests.',
        details: config.packetLoss
          ? [
              'A dropped call is a transient failure: trying again usually works.',
              config.retryEnabled
                ? 'Retry is on, so most drops are masked at the cost of latency.'
                : 'Enable retry to mask most of these failures.',
              'Drops are seeded, so the same sequence of requests always drops the same calls.',
            ]
          : notes.slice(0, 2),
      }
    case 'timeout':
      return {
        tone: 'warning',
        headline: `The Order Service now gives up on a dependency after ${config.timeoutMs} ms.`,
        details: [
          'A shorter timeout fails sooner and frees resources; a longer one tolerates slow services but holds the caller hostage.',
        ],
      }
    case 'mechanism': {
      const { mechanism, enabled } = action
      if (!enabled) {
        return {
          tone: notes.length ? 'warning' : 'healthy',
          headline: `${{ retry: 'Retry', circuitBreaker: 'Circuit breaker', cache: 'Redis cache', queue: 'Message queue' }[mechanism]} disabled.`,
          details: notes.length ? notes.slice(0, 3) : ['Send requests to compare with the previous results.'],
        }
      }
      const headline = {
        retry: 'Retries are masking transient failures, but each failed request can now generate additional traffic.',
        circuitBreaker: `The circuit breaker is watching Payment and Inventory. ${config.failureThreshold} failures in a row will open the circuit.`,
        cache: 'Cache hits are reducing requests to the downstream service and lowering simulated latency.',
        queue: 'Orders are now asynchronous: Order Service queues the work and answers the client immediately.',
      }[mechanism]
      const detail = {
        retry: `Each failed call is retried up to ${config.maxRetries} ${config.maxRetries === 1 ? 'time' : 'times'}, with a short backoff before each attempt.`,
        circuitBreaker: `While OPEN, calls fail fast. After ${config.recoveryMs / 1000} s it goes HALF OPEN and one trial request decides whether it closes.`,
        cache:
          'Stock levels are cached per product. The first request for a product is a MISS; repeats within a few seconds are HITs and skip Inventory.',
        queue:
          'Message Queue consumers process inventory and payment in the background. Watch messages move from Queued to Processing to Completed.',
      }[mechanism]
      return { tone: 'healthy', headline, details: [detail, ...notes].slice(0, 3), tradeoff: MECHANISM_TRADEOFFS[mechanism] }
    }
    case 'setting': {
      const text = {
        maxRetries: `Up to ${config.maxRetries} retries per call. More retries mask more failures, but multiply load on a struggling service.`,
        failureThreshold: `The circuit opens after ${config.failureThreshold} consecutive failures. Lower trips sooner; higher tolerates noise.`,
        recoveryMs: `An open circuit waits ${config.recoveryMs / 1000} s before a trial request.`,
      }[action.key]
      return { tone: 'healthy', headline: text, details: notes.slice(0, 2) }
    }
    case 'scenario': {
      const scenario = getScenario(action.id)
      if (!scenario) return explain(config, state, null)
      return {
        tone: 'warning',
        headline: `Scenario loaded: ${scenario.title}. ${scenario.description}`,
        details: scenario.suggestions.slice(0, 3),
      }
    }
    case 'reset':
      return {
        tone: 'healthy',
        headline: 'Simulation reset. All services are healthy and every mechanism is off.',
        details: ['Metrics and the timeline are cleared. Send a request to start again.'],
      }
  }
}
