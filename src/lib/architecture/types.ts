/**
 * Architecture designs as plain, serializable data. Nothing here knows about
 * React Flow: the designer converts to and from canvas nodes at the edge.
 */

export type ComponentType =
  // Compute
  | 'client'
  | 'webapp'
  | 'gateway'
  | 'loadBalancer'
  | 'service'
  | 'worker'
  | 'function'
  // Data
  | 'sql'
  | 'nosql'
  | 'cache'
  | 'objectStorage'
  | 'search'
  // Messaging
  | 'queue'
  | 'eventBus'
  | 'stream'
  // Infrastructure
  | 'cdn'
  | 'dns'
  | 'auth'
  | 'rateLimiter'
  // Observability
  | 'logging'
  | 'metrics'
  | 'tracing'

export type ComponentCategory = 'compute' | 'data' | 'messaging' | 'infrastructure' | 'observability'

export type Capacity = 'low' | 'medium' | 'high'
export type Replication = 'none' | 'replicas' | 'multi-region'

/**
 * Configuration the evaluator can reason about. Every field is optional:
 * each component type uses the few that matter for it (see the catalog).
 */
export interface ComponentConfig {
  /** Service, gateway, worker, load balancer, web app: running copies. */
  instances?: number
  autoscaling?: boolean
  cpu?: 'small' | 'medium' | 'large'
  /** Service: how clients talk to it. WebSocket keeps connections open. */
  protocol?: 'http' | 'websocket'
  /** Databases, cache, search, object storage. */
  readCapacity?: Capacity
  writeCapacity?: Capacity
  replication?: Replication
  /** Databases, CDN, services: regions deployed to. */
  regions?: number
  /** Cache and CDN, seconds. */
  ttl?: number
  cacheStrategy?: 'cache-aside' | 'write-through' | 'write-back'
  eviction?: 'lru' | 'lfu' | 'ttl'
}

export interface DesignNode {
  id: string
  type: ComponentType
  /** Display name, e.g. "Payment Service". Defaults to the type's label. */
  label: string
  position: { x: number; y: number }
  config: ComponentConfig
}

/** A directed connection: `source` sends requests (or messages) to `target`. */
export interface DesignEdge {
  id: string
  source: string
  target: string
}

export interface Architecture {
  challengeId: string
  nodes: DesignNode[]
  edges: DesignEdge[]
}

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'

/**
 * What a challenge demands, in terms the rules can test. Kept coarse on
 * purpose: rules ask "is this read-heavy?", not "how many QPS exactly?".
 */
export interface ChallengeProfile {
  /** 1 moderate, 2 high, 3 very high traffic. */
  scale: 1 | 2 | 3
  readHeavy: boolean
  writeHeavy: boolean
  /** Users spread across continents. */
  global: boolean
  /** Large static content (video, images) dominates bandwidth. */
  media: boolean
  /** Work that can or should happen outside the request (encoding, sending, fulfilment). */
  asyncWork: boolean
  /** Long-lived connections and push to clients. */
  realtime: boolean
  /** Money or stock: correctness beats freshness. */
  strongConsistency: boolean
  search: boolean
  auth: boolean
  analytics: boolean
  rateLimiting: boolean
  budget: 'lean' | 'moderate' | 'generous'
}

/** A service the challenge needs, matched against node labels. */
export interface ServiceHint {
  name: string
  /** Lower-case keywords; a service whose label contains one counts. */
  keywords: string[]
}

export interface ServiceDependency {
  /** Keywords of the dependent service, e.g. ['checkout']. */
  when: string[]
  /** Keywords of the service it needs, e.g. ['payment']. */
  requires: string[]
  message: string
}

export interface Challenge {
  id: string
  title: string
  difficulty: Difficulty
  tagline: string
  scale: string[]
  problem: string
  functional: string[]
  nonFunctional: Array<{ label: string; target: string }>
  constraints: Array<{ label: string; value: string }>
  criteria: string[]
  profile: ChallengeProfile
  /** Services a typical decomposition would have; offered as name suggestions. */
  services: ServiceHint[]
  dependencies: ServiceDependency[]
}

export type IssueSeverity = 'error' | 'warning' | 'suggestion'

export interface ValidationIssue {
  id: string
  severity: IssueSeverity
  message: string
  nodeIds: string[]
}

export interface ValidationResult {
  issues: ValidationIssue[]
  /** False only when the design is too incomplete to evaluate at all. */
  canEvaluate: boolean
  blockingReason?: string
}

export type Dimension = 'scalability' | 'reliability' | 'performance' | 'cost' | 'complexity' | 'maintainability'

export const DIMENSIONS: Dimension[] = ['scalability', 'reliability', 'performance', 'cost', 'complexity', 'maintainability']

export const DIMENSION_LABELS: Record<Dimension, string> = {
  scalability: 'Scalability',
  reliability: 'Reliability',
  performance: 'Performance',
  cost: 'Cost',
  complexity: 'Complexity',
  maintainability: 'Maintainability',
}

/** One reason a score moved. `rule` identifies the rule, for before/after attribution. */
export interface ScoreFactor {
  rule: string
  delta: number
  text: string
}

export interface Score {
  /** 0–10. For cost and complexity, higher means cheaper and simpler. */
  value: number
  factors: ScoreFactor[]
}

export type InsightSeverity = 'high' | 'medium' | 'low'

export interface Insight {
  id: string
  title: string
  detail: string
  severity: InsightSeverity
  nodeIds: string[]
}

export interface Recommendation {
  id: string
  title: string
  problem: string
  why: string
  suggestion: string
  severity: InsightSeverity
  /** Dimensions the change would mainly improve. */
  improves: Dimension[]
}

export interface Tradeoff {
  id: string
  title: string
  benefit: string
  cost: string
  /** Why it matters in this design for this challenge. */
  context?: string
}

export interface ArchitectureEvaluation {
  challengeId: string
  overallScore: number
  scores: Record<Dimension, Score>
  strengths: Insight[]
  weaknesses: Insight[]
  bottlenecks: Insight[]
  singlePointsOfFailure: Insight[]
  recommendations: Recommendation[]
  tradeoffs: Tradeoff[]
  summary: string
  characteristics: string[]
}
