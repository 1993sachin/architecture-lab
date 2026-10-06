export type ArchitectureMode = 'monolith' | 'microfrontends'
export type ModuleId = 'workspace' | 'content' | 'analytics'

export const MODULES: ModuleId[] = ['workspace', 'content', 'analytics']

export const MODULE_LABELS: Record<ModuleId, string> = {
  workspace: 'Workspace',
  content: 'Content',
  analytics: 'Analytics',
}

export interface MfeConfig {
  mode: ArchitectureMode
  /** Modules taken offline, in MODULES order. Several can be down at once. */
  failures: ModuleId[]
  /** Extra network latency added to every network hop, in ms. */
  latencyMs: number
  /** Probability (0–1) that a backend API call fails. */
  apiFailureRate: number
  caching: boolean
  lazyLoading: boolean
  /** Only meaningful for microfrontends; a monolith always deploys as one unit. */
  independentDeployment: boolean
}

export type RequestOutcome = 'ok' | 'cached' | 'failed'

export interface RequestRecord {
  id: number
  tick: number
  module: ModuleId
  outcome: RequestOutcome
  status: number
  latency: number
  /** Short human-readable cause, shown in the request log. */
  note: string
}

export interface ModuleTickStats {
  requests: number
  failed: number
  cached: number
  latencySum: number
}

export interface TickSample {
  tick: number
  requests: number
  succeeded: number
  failed: number
  avgLatency: number
  modules: Record<ModuleId, ModuleTickStats>
}

export interface MfeSimState {
  tick: number
  seed: number
  nextRequestId: number
  totals: { requests: number; succeeded: number; failed: number; cached: number; latencySum: number }
  /** Most recent samples, oldest first. */
  history: TickSample[]
  /** Most recent requests, newest first. */
  log: RequestRecord[]
}

export interface MfeMetrics {
  requests: number
  succeeded: number
  failed: number
  /** Average latency over the recent window, ms. */
  latency: number
  p95Latency: number
  /** Share of recent requests that succeeded (including stale cache hits), 0–1. */
  availability: number
  requestsPerSecond: number
  /** Per-module error rate over the recent window, 0–1. */
  moduleErrorRate: Record<ModuleId, number>
  moduleRps: Record<ModuleId, number>
  moduleCacheRate: Record<ModuleId, number>
}
