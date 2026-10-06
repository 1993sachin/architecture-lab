import { Rng } from '@/lib/random'
import {
  MODULES,
  MODULE_LABELS,
  type MfeConfig,
  type MfeMetrics,
  type MfeSimState,
  type ModuleId,
  type ModuleTickStats,
  type RequestRecord,
  type TickSample,
} from './types'

/**
 * Microfrontend playground simulation.
 *
 * Each tick, simulated users make REQUESTS_PER_TICK page interactions spread
 * across the three modules. Every request is resolved against the current
 * configuration: architecture mode, the injected failure, network latency,
 * API failure probability and the enabled strategies. The model is
 * deliberately simple and deterministic for a given seed; it exists to make
 * trade-offs visible, not to benchmark anything.
 */

export const TICK_MS = 800
export const REQUESTS_PER_TICK = 8
export const HISTORY_LENGTH = 40
export const LOG_LENGTH = 14
/** Ticks used for "current" metrics such as availability and latency. */
export const WINDOW_TICKS = 6

export const DEFAULT_CONFIG: MfeConfig = {
  mode: 'microfrontends',
  failures: [],
  latencyMs: 40,
  apiFailureRate: 0.02,
  caching: false,
  lazyLoading: true,
  independentDeployment: true,
}

/** Share of traffic each module receives. */
const TRAFFIC: Record<ModuleId, number> = { workspace: 0.45, content: 0.35, analytics: 0.2 }

export const LATENCY = {
  shell: 25,
  /** Fetching a remote module over the network: the price of runtime composition. */
  remoteFetch: 18,
  /** Eager loading ships every module up front. */
  eagerBundle: 14,
  api: 60,
  cacheHit: 6,
  /** Shell waits this long for a dead remote entry before giving up. */
  remoteTimeout: 260,
  /** Extra time while a coupled release is rolled back across all modules. */
  coupledRollback: 70,
} as const

export const PROBABILITY = {
  cacheHit: 0.65,
  /** Share of failed requests that a stale cache can still serve. */
  staleServe: 0.5,
  /** Failure rate of healthy modules during a coupled rollback. */
  coupledFailure: 0.25,
} as const

function emptyModuleStats(): Record<ModuleId, ModuleTickStats> {
  return {
    workspace: { requests: 0, failed: 0, cached: 0, latencySum: 0 },
    content: { requests: 0, failed: 0, cached: 0, latencySum: 0 },
    analytics: { requests: 0, failed: 0, cached: 0, latencySum: 0 },
  }
}

export function createInitialState(seed = 42): MfeSimState {
  return {
    tick: 0,
    seed,
    nextRequestId: 1,
    totals: { requests: 0, succeeded: 0, failed: 0, cached: 0, latencySum: 0 },
    history: [],
    log: [],
  }
}

type Resolution = Pick<RequestRecord, 'outcome' | 'status' | 'latency' | 'note'>

/** Resolves a single request to `module` under `config`. Pure apart from the RNG. */
export function resolveRequest(module: ModuleId, config: MfeConfig, rng: Rng): Resolution {
  const label = MODULE_LABELS[module]
  const net = config.latencyMs
  const isMfe = config.mode === 'microfrontends'
  const failing = config.failures.length ? config.failures[0] : null

  // Client-side cost: shell render, plus fetching the remote module in MFE mode.
  let latency = LATENCY.shell
  if (isMfe) latency += LATENCY.remoteFetch + net * 0.5
  if (!config.lazyLoading) latency += LATENCY.eagerBundle

  // Monolith: one bundle and one runtime, so one crash takes everything down.
  if (!isMfe && failing) {
    return {
      outcome: 'failed',
      status: 500,
      latency: Math.round(latency),
      note: `App crashed: ${MODULE_LABELS[failing]} error took down the bundle`,
    }
  }

  // Eagerly loaded microfrontends make the shell wait for a dead remote on boot.
  if (isMfe && failing && !config.lazyLoading) latency += LATENCY.remoteTimeout

  if (isMfe && config.failures.includes(module)) {
    if (config.caching && rng.chance(PROBABILITY.staleServe)) {
      return { outcome: 'cached', status: 200, latency: Math.round(latency + LATENCY.cacheHit), note: `${label} served from cache (stale)` }
    }
    return { outcome: 'failed', status: 503, latency: Math.round(latency), note: `${label} MFE unavailable, fallback shown` }
  }

  // Without independent deployment, a broken module forces a coupled rollback.
  if (isMfe && failing && !config.independentDeployment) {
    latency += LATENCY.coupledRollback
    if (rng.chance(PROBABILITY.coupledFailure)) {
      return { outcome: 'failed', status: 502, latency: Math.round(latency), note: `${label} caught in coupled rollback` }
    }
  }

  // Backend call, possibly short-circuited by the cache.
  if (config.caching && rng.chance(PROBABILITY.cacheHit)) {
    return { outcome: 'ok', status: 200, latency: Math.round(latency + LATENCY.cacheHit), note: 'cache hit' }
  }
  latency += LATENCY.api + net
  if (rng.chance(config.apiFailureRate)) {
    if (config.caching && rng.chance(PROBABILITY.staleServe)) {
      return { outcome: 'cached', status: 200, latency: Math.round(latency), note: `${label} API failed, served stale cache` }
    }
    return { outcome: 'failed', status: 502, latency: Math.round(latency), note: `${label} API error` }
  }
  return { outcome: 'ok', status: 200, latency: Math.round(latency), note: 'ok' }
}

/** Advances the simulation by one tick. Returns a new state; never mutates. */
export function step(state: MfeSimState, config: MfeConfig): MfeSimState {
  const rng = new Rng(state.seed)
  const tick = state.tick + 1
  const modules = emptyModuleStats()
  const records: RequestRecord[] = []
  let nextRequestId = state.nextRequestId
  let succeeded = 0
  let failed = 0
  let cached = 0
  let latencySum = 0

  for (let i = 0; i < REQUESTS_PER_TICK; i++) {
    const module = rng.weighted(TRAFFIC)
    const result = resolveRequest(module, config, rng)
    const record: RequestRecord = { id: nextRequestId++, tick, module, ...result }
    records.push(record)

    const m = modules[module]
    m.requests++
    m.latencySum += result.latency
    latencySum += result.latency
    if (result.outcome === 'failed') {
      m.failed++
      failed++
    } else {
      succeeded++
      if (result.outcome === 'cached') {
        m.cached++
        cached++
      }
    }
  }

  const sample: TickSample = {
    tick,
    requests: REQUESTS_PER_TICK,
    succeeded,
    failed,
    avgLatency: latencySum / REQUESTS_PER_TICK,
    modules,
  }

  return {
    tick,
    seed: rng.seed,
    nextRequestId,
    totals: {
      requests: state.totals.requests + REQUESTS_PER_TICK,
      succeeded: state.totals.succeeded + succeeded,
      failed: state.totals.failed + failed,
      cached: state.totals.cached + cached,
      latencySum: state.totals.latencySum + latencySum,
    },
    history: [...state.history, sample].slice(-HISTORY_LENGTH),
    log: [...records.reverse(), ...state.log].slice(0, LOG_LENGTH),
  }
}

/** Runs `ticks` steps; handy for tests and for warming up a fresh experiment. */
export function run(state: MfeSimState, config: MfeConfig, ticks: number): MfeSimState {
  let s = state
  for (let i = 0; i < ticks; i++) s = step(s, config)
  return s
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

/** Derives the metrics the UI shows from raw simulation state. */
export function computeMetrics(state: MfeSimState): MfeMetrics {
  const window = state.history.slice(-WINDOW_TICKS)
  const windowRequests = window.reduce((n, s) => n + s.requests, 0)
  const windowSucceeded = window.reduce((n, s) => n + s.succeeded, 0)
  const windowLatency = window.reduce((n, s) => n + s.avgLatency * s.requests, 0)
  const seconds = (window.length * TICK_MS) / 1000

  const moduleErrorRate = {} as Record<ModuleId, number>
  const moduleRps = {} as Record<ModuleId, number>
  const moduleCacheRate = {} as Record<ModuleId, number>
  for (const id of MODULES) {
    const req = window.reduce((n, s) => n + s.modules[id].requests, 0)
    const fail = window.reduce((n, s) => n + s.modules[id].failed, 0)
    const hit = window.reduce((n, s) => n + s.modules[id].cached, 0)
    moduleErrorRate[id] = req ? fail / req : 0
    moduleCacheRate[id] = req ? hit / req : 0
    moduleRps[id] = seconds ? req / seconds : 0
  }

  // p95 is estimated from the logged requests, which cover the latest ticks.
  const p95Latency = percentile(state.log.map((r) => r.latency), 0.95)

  return {
    requests: state.totals.requests,
    succeeded: state.totals.succeeded,
    failed: state.totals.failed,
    latency: windowRequests ? windowLatency / windowRequests : 0,
    p95Latency,
    availability: windowRequests ? windowSucceeded / windowRequests : 1,
    requestsPerSecond: seconds ? windowRequests / seconds : 0,
    moduleErrorRate,
    moduleRps,
    moduleCacheRate,
  }
}
