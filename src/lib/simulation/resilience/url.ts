import { readBool, readEnum, readList, writeParams } from '@/lib/urlState'
import { DEFAULT_CONFIG } from './engine'
import { SCENARIOS, getScenario, scenarioConfig, type ScenarioId } from './scenarios'
import { KILLABLE, type ResilienceConfig } from './types'

/**
 * Shareable experiment state, e.g.
 * `#/experiments/resilience?scenario=payment-outage&retry=true&circuitBreaker=true`.
 * A scenario sets the failures; the remaining parameters set mechanisms and
 * any extra failure the visitor injected.
 */
export interface ResilienceUrlState {
  scenarioId: ScenarioId | null
  config: ResilienceConfig
}

const SCENARIO_IDS = SCENARIOS.map((s) => s.id)

export function parseResilienceParams(params: URLSearchParams): ResilienceUrlState {
  const scenarioId = readEnum(params, 'scenario', SCENARIO_IDS) ?? null
  const scenario = getScenario(scenarioId)
  const base = scenario ? scenarioConfig(scenario) : DEFAULT_CONFIG
  const killed = readList(params, 'kill', KILLABLE)
  const config: ResilienceConfig = {
    ...base,
    killed: killed ? [...killed].sort() : base.killed,
    latencyMs: readEnum(params, 'latency', [0, 100, 500, 1000] as const) ?? base.latencyMs,
    packetLoss: readEnum(params, 'loss', [0, 0.1, 0.5] as const) ?? base.packetLoss,
    retryEnabled: readBool(params, 'retry') ?? base.retryEnabled,
    maxRetries: readEnum(params, 'maxRetries', [1, 2, 3] as const) ?? base.maxRetries,
    circuitBreakerEnabled: readBool(params, 'circuitBreaker') ?? base.circuitBreakerEnabled,
    cacheEnabled: readBool(params, 'cache') ?? base.cacheEnabled,
    queueEnabled: readBool(params, 'queue') ?? base.queueEnabled,
  }
  return { scenarioId, config }
}

export function serializeResilienceParams({ scenarioId, config }: ResilienceUrlState): URLSearchParams {
  const scenario = getScenario(scenarioId)
  const base = scenario ? scenarioConfig(scenario) : DEFAULT_CONFIG
  return writeParams([
    ['scenario', scenarioId ?? '', !scenario],
    ['kill', config.killed.join(','), config.killed.join(',') === base.killed.join(',')],
    ['latency', config.latencyMs, config.latencyMs === base.latencyMs],
    ['loss', config.packetLoss, config.packetLoss === base.packetLoss],
    ['retry', config.retryEnabled, config.retryEnabled === base.retryEnabled],
    ['maxRetries', config.maxRetries, !config.retryEnabled || config.maxRetries === base.maxRetries],
    ['circuitBreaker', config.circuitBreakerEnabled, config.circuitBreakerEnabled === base.circuitBreakerEnabled],
    ['cache', config.cacheEnabled, config.cacheEnabled === base.cacheEnabled],
    ['queue', config.queueEnabled, config.queueEnabled === base.queueEnabled],
  ])
}
