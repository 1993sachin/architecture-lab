/** Services that place an order: Client → Gateway → Order → Payment / Inventory. */
export type NodeId = 'client' | 'gateway' | 'order' | 'payment' | 'inventory' | 'paymentDb' | 'inventoryDb' | 'cache' | 'queue'

/** Downstream dependencies the Order Service calls; each has its own circuit breaker. */
export type DependencyId = 'payment' | 'inventory'
export const DEPENDENCIES: DependencyId[] = ['inventory', 'payment']

/** Components the visitor can kill. */
export type KillableService = 'order' | 'payment' | 'inventory' | 'paymentDb'
export const KILLABLE: KillableService[] = ['payment', 'inventory', 'order', 'paymentDb']

export const SERVICE_LABELS: Record<NodeId, string> = {
  client: 'Client',
  gateway: 'API Gateway',
  order: 'Order Service',
  payment: 'Payment Service',
  inventory: 'Inventory Service',
  paymentDb: 'Payment Database',
  inventoryDb: 'Inventory Database',
  cache: 'Redis Cache',
  queue: 'Message Queue',
}

export type NetworkLatency = 0 | 100 | 500 | 1000
export type PacketLoss = 0 | 0.1 | 0.5

export interface ResilienceConfig {
  /** Killed components, kept sorted so equal configs compare equal. */
  killed: KillableService[]
  /** Extra network latency added to every service call, ms. */
  latencyMs: NetworkLatency
  /** Share of service calls dropped by the network. */
  packetLoss: PacketLoss
  /** Extra processing time for a slow dependency, ms. */
  slowdown: Partial<Record<DependencyId, number>>
  /** How long the Order Service waits for a dependency before giving up, ms. */
  timeoutMs: number
  retryEnabled: boolean
  maxRetries: 1 | 2 | 3
  circuitBreakerEnabled: boolean
  /** Consecutive failures that open the circuit. */
  failureThreshold: number
  /** How long the circuit stays open before a trial request, ms. */
  recoveryMs: number
  cacheEnabled: boolean
  queueEnabled: boolean
}

export type BreakerState = 'closed' | 'open' | 'half-open'

export interface Breaker {
  state: BreakerState
  consecutiveFailures: number
  /** Simulated time the circuit last opened, ms. */
  openedAt: number
}

export type RequestStatus = 'success' | 'accepted' | 'failed' | 'timeout' | 'circuit-open'

/** Status shown for a request while (and after) it travels the diagram. */
export type RequestBadge = 'IN FLIGHT' | 'RETRYING' | 'SUCCESS' | 'ACCEPTED' | 'FAILED' | 'TIMEOUT' | 'CIRCUIT OPEN'

export type StepKind =
  | 'request'
  | 'response'
  | 'retry'
  | 'failed'
  | 'timeout'
  | 'circuit-open'
  | 'cache-hit'
  | 'cache-miss'
  | 'enqueue'

/** One hop of a request along an edge, in order. */
export interface TraceStep {
  from: NodeId
  to: NodeId
  kind: StepKind
  badge: RequestBadge
  label: string
}

export interface RequestTrace {
  requestId: number
  sku: string
  status: RequestStatus
  latency: number
  retries: number
  steps: TraceStep[]
  /** Circuit transitions this request caused, for explanations. */
  transitions: Array<{ dependency: DependencyId; to: BreakerState }>
  /** The dependency (or service) that caused a failure, if any. */
  failedAt?: NodeId
  cache?: 'hit' | 'miss'
}

export type QueueStatus = 'queued' | 'processing' | 'completed'

export interface QueueMessage {
  id: number
  requestId: number
  status: QueueStatus
  attempts: number
  /** Why the last processing attempt failed, if it did. */
  waitingOn?: NodeId
}

export type EventTone = 'neutral' | 'success' | 'failed' | 'warning' | 'info'

export interface TimelineEvent {
  id: number
  /** Simulated time, ms since the run started. */
  t: number
  requestId?: number
  text: string
  tone: EventTone
}

export interface ResilienceMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  timeouts: number
  circuitRejections: number
  latencySum: number
  retryCount: number
  cacheHits: number
  cacheMisses: number
  /** Calls actually made to each dependency, retries included. */
  dependencyCalls: Record<DependencyId, number>
}

export interface ResilienceState {
  seed: number
  /** Simulated clock, ms. Advances with each request, never with wall time. */
  clock: number
  nextRequestId: number
  nextEventId: number
  nextMessageId: number
  breakers: Record<DependencyId, Breaker>
  /** sku → simulated time the cache entry expires. */
  cache: Record<string, number>
  queue: QueueMessage[]
  completedMessages: number
  /** Service → simulated time it finishes warming up after a restore. */
  recoveringUntil: Partial<Record<KillableService, number>>
  metrics: ResilienceMetrics
  /** Latency and outcome of recent requests, oldest first. */
  recent: Array<{ requestId: number; latency: number; ok: boolean }>
  timeline: TimelineEvent[]
  lastTrace: RequestTrace | null
}
