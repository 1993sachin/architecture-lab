import type { ResilienceConfig, ResilienceState } from '@/lib/simulation/resilience'
import type { GuidedExperimentDef } from '@/lib/guide/types'
import type { HelpContent } from '@/components/guide/ContextualHelp'
import type { TryIdea } from '@/components/guide/TrySomething'
import { useResilienceStore } from '@/store/resilienceStore'

export interface ResilienceGuideState {
  config: ResilienceConfig
  /** The state visitors see: it updates when a request's animation finishes. */
  sim: ResilienceState
  /** A request is still travelling or queued. */
  busy: boolean
}

const store = () => useResilienceStore.getState()
const paymentDown = (s: ResilienceGuideState) => s.config.killed.includes('payment')
const send = (n: number) => () => store().queueRequests(n)
const setMechanism = (patch: Partial<ResilienceConfig>, mechanism: 'retry' | 'circuitBreaker' | 'cache' | 'queue') => () =>
  store().setConfig(patch, { kind: 'mechanism', mechanism, enabled: true })

export const RESILIENCE_GUIDE: GuidedExperimentDef<ResilienceGuideState> = {
  id: 'resilience',
  title: 'Survive a payment outage',
  scenario: 'Your Payment Service just went down.',
  introduction: 'A production service has failed. Let’s see how different resilience patterns change the outcome.',
  steps: [
    {
      id: 'break',
      title: 'Break it',
      description: 'Kill Payment Service, then send an order through the system.',
      phase: 'break',
      tasks: [
        {
          id: 'kill',
          label: 'Kill Payment Service',
          done: paymentDown,
          action: { label: 'Kill Payment Service', run: () => store().toggleKill('payment') },
          target: 'res-kill-payment',
        },
        {
          id: 'send',
          label: 'Send a request',
          visible: paymentDown,
          done: (s) => paymentDown(s) && !s.busy && !!s.sim.lastTrace && s.sim.lastTrace.status !== 'success',
          action: { label: 'Send Request', run: send(1) },
          target: 'res-send',
        },
      ],
      evidence: (s) =>
        s.sim.lastTrace ? ['Request', 'Order Service', 'Payment ✕', `FAILED · ${s.sim.lastTrace.latency} ms`] : null,
      explanation:
        'Orders depending synchronously on Payment are now failing. The Order Service needs an answer from Payment before it can confirm an order, so one dead dependency fails the whole request.',
      hints: [
        'Something has to fail before anything can recover. Look at Failure Injection.',
        'Payment Service has its own kill switch under “Service failures”, and Send Request is above the diagram.',
        'Press “Kill Payment Service”, then “Send Request”.',
      ],
    },
    {
      id: 'retry',
      title: 'Add retry',
      description: 'Retries are the first thing most teams reach for. Enable Retry, then send another order.',
      phase: 'build',
      tasks: [
        {
          id: 'enable',
          label: 'Enable Retry',
          done: (s) => s.config.retryEnabled,
          action: { label: 'Enable Retry', run: setMechanism({ retryEnabled: true }, 'retry') },
          target: 'res-retry',
        },
        {
          id: 'send',
          label: 'Send a request',
          visible: (s) => s.config.retryEnabled,
          done: (s) => !s.busy && (s.sim.lastTrace?.retries ?? 0) > 0,
          action: { label: 'Send Request', run: send(1) },
          target: 'res-send',
        },
      ],
      evidence: (s) => {
        const t = s.sim.lastTrace
        if (!t) return null
        return ['Request', 'Failure', ...Array.from({ length: t.retries }, () => 'Retry'), `Failure · ${t.latency} ms`]
      },
      explanation:
        'Retry helps with transient failures, but the dependency is completely down. Retrying only adds latency and traffic: Payment was called several times for one order, and the order still failed, just more slowly.',
      hints: [
        'Resilience Mechanisms has the patterns you can switch on.',
        'Retry is the first switch in that panel.',
        'Press “Enable Retry”, then “Send Request”.',
      ],
    },
    {
      id: 'breaker',
      title: 'Add a circuit breaker',
      description: 'Stop hammering a dependency that is clearly down. Enable the Circuit Breaker and send a few orders.',
      phase: 'observe',
      tasks: [
        {
          id: 'enable',
          label: 'Enable Circuit Breaker',
          done: (s) => s.config.circuitBreakerEnabled,
          action: { label: 'Enable Circuit Breaker', run: setMechanism({ circuitBreakerEnabled: true }, 'circuitBreaker') },
          target: 'res-breaker',
        },
        {
          id: 'send',
          label: 'Send requests until the circuit opens',
          visible: (s) => s.config.circuitBreakerEnabled,
          done: (s) => s.config.circuitBreakerEnabled && s.sim.breakers.payment.state === 'open',
          action: { label: 'Send 3 Requests', run: send(3) },
          target: 'res-send-10',
        },
      ],
      evidence: () => ['CLOSED', 'OPEN'],
      explanation:
        'The circuit breaker stops repeatedly calling an unhealthy dependency. After enough consecutive failures it opened, and orders now fail fast as CIRCUIT OPEN instead of waiting on Payment and retrying.',
      observe: 'Look at the Circuit tile and the fast-failed count: failures got cheaper, not fewer.',
      hints: [
        'The pattern you need sits under Retry in Resilience Mechanisms.',
        'Enable the Circuit Breaker, then send several requests in a row.',
        'Press “Enable Circuit Breaker”, then “Send 3 Requests”.',
      ],
    },
    {
      id: 'recover',
      title: 'Restore Payment',
      description: 'The Payment team fixes the outage. Restore Payment Service and keep sending orders.',
      phase: 'try-again',
      tasks: [
        {
          id: 'restore',
          label: 'Restore Payment Service',
          done: (s) => !paymentDown(s),
          action: { label: 'Restore Payment Service', run: () => store().toggleKill('payment') },
          target: 'res-kill-payment',
        },
        {
          id: 'send',
          label: 'Send requests until the circuit closes',
          visible: (s) => !paymentDown(s),
          done: (s) => !paymentDown(s) && s.config.circuitBreakerEnabled && s.sim.breakers.payment.state === 'closed',
          action: { label: 'Send 10 Requests', run: send(10) },
          target: 'res-send-10',
        },
      ],
      evidence: () => ['OPEN', 'HALF-OPEN', 'CLOSED'],
      explanation:
        'While open, the breaker rejected calls without touching Payment. Once its recovery window passed it went HALF-OPEN and let a single trial request through. Payment answered, so the breaker CLOSED and orders flow normally again. Had the trial failed, it would have opened for another window.',
      hints: [
        'Recovery starts by undoing the failure.',
        'Restore Payment in Failure Injection, then keep sending requests while the recovery window passes.',
        'Press “Restore Payment Service”, then “Send 10 Requests”.',
      ],
    },
  ],
  completionMessage: 'You just experienced why resilience patterns are complementary rather than interchangeable.',
  learned: {
    topic: 'Resilience patterns',
    points: [
      { term: 'Retry', detail: 'handles transient failures' },
      { term: 'Circuit breaker', detail: 'prevents repeated calls to unhealthy dependencies' },
      { term: 'Timeout', detail: 'limits waiting' },
      { term: 'Queue', detail: 'decouples work' },
      { term: 'Cache', detail: 'reduces dependency pressure' },
    ],
  },
  next: [{ label: 'Try Architecture Simulator', to: '/simulator' }],
}

export const RESILIENCE_HELP: HelpContent = {
  looking:
    'An order system: Client → API Gateway → Order Service, which calls Payment and Inventory. Each request is animated hop by hop, with metrics and a timeline underneath.',
  change:
    'Kill services, add latency or packet loss, and switch on timeouts, retries, a circuit breaker, a cache or a message queue.',
  tryThis: 'Kill Payment Service, send a few requests, then turn on one mechanism at a time and send again.',
  learn: 'Each pattern fixes one kind of failure and costs something else. None of them is a universal answer.',
}

export const RESILIENCE_IDEAS: TryIdea[] = [
  {
    id: 'breaker',
    text: 'Kill Payment Service and enable Circuit Breaker.',
    watch: 'requests fail fast once the circuit opens',
    run: () => {
      store().loadScenario('payment-outage')
      setMechanism({ circuitBreakerEnabled: true }, 'circuitBreaker')()
      store().queueRequests(6)
    },
  },
  {
    id: 'queue',
    text: 'Kill Payment Service and enable the message queue.',
    watch: 'orders accepted now and paid later',
    run: () => {
      store().loadScenario('payment-outage')
      setMechanism({ queueEnabled: true }, 'queue')()
      store().queueRequests(5)
    },
  },
  {
    id: 'slow-cache',
    text: 'Slow Inventory down, then turn on the cache.',
    watch: 'repeat products skipping Inventory',
    run: () => {
      store().loadScenario('inventory-slowdown')
      setMechanism({ cacheEnabled: true }, 'cache')()
      store().queueRequests(8)
    },
  },
  {
    id: 'packet-loss',
    text: 'Drop half of all network calls and compare retry on and off.',
    watch: 'availability rising while latency climbs',
    run: () => {
      store().loadScenario('network-instability')
      setMechanism({ retryEnabled: true }, 'retry')()
      store().queueRequests(8)
    },
  },
  {
    id: 'database',
    text: 'Kill the Payment Database instead of the service.',
    watch: 'the failure cascading from the database up to the client',
    run: () => {
      store().loadScenario('database-failure')
      store().queueRequests(3)
    },
  },
]
