import { DEFAULT_CONFIG } from './engine'
import type { ResilienceConfig } from './types'

export type ScenarioId = 'payment-outage' | 'inventory-slowdown' | 'network-instability' | 'database-failure'

export interface Scenario {
  id: ScenarioId
  title: string
  description: string
  /** What to try once the scenario is loaded. */
  suggestions: string[]
  /** Failure conditions the scenario applies on top of the default config. */
  failure: Partial<ResilienceConfig>
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'payment-outage',
    title: 'Payment Outage',
    description: 'The Payment Service is down. Every order that needs a payment fails.',
    suggestions: [
      'Enable retry and watch it fail three times as slowly',
      'Enable the circuit breaker to fail fast',
      'Enable the message queue to keep accepting orders',
    ],
    failure: { killed: ['payment'] },
  },
  {
    id: 'inventory-slowdown',
    title: 'Inventory Slowdown',
    description: 'Inventory takes 1.2 s to answer, longer than the 1 s timeout.',
    suggestions: [
      'Watch requests hit the timeout',
      'Enable retry: every attempt times out again',
      'Enable the cache so repeat products skip Inventory',
      'Enable the circuit breaker to stop waiting',
    ],
    failure: { slowdown: { inventory: 1200 }, timeoutMs: 1000 },
  },
  {
    id: 'network-instability',
    title: 'Network Instability',
    description: 'Half of all service calls are dropped by the network.',
    suggestions: [
      'Enable retry with 3 attempts and compare availability',
      'Note how retries raise latency',
      'Enable the cache to make fewer network calls',
    ],
    failure: { packetLoss: 0.5 },
  },
  {
    id: 'database-failure',
    title: 'Database Failure',
    description: 'The Payment Database is down. Payment Service is running but cannot do its job.',
    suggestions: [
      'See the failure cascade from the database to the client',
      'Enable the circuit breaker to stop hammering Payment',
      'Enable the message queue to defer payments',
    ],
    failure: { killed: ['paymentDb'] },
  },
]

export function getScenario(id: string | null | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

/** A healthy system with the visitor's resilience mechanisms kept as they are. */
export function withMechanisms(mechanisms: ResilienceConfig): ResilienceConfig {
  return {
    ...DEFAULT_CONFIG,
    retryEnabled: mechanisms.retryEnabled,
    maxRetries: mechanisms.maxRetries,
    circuitBreakerEnabled: mechanisms.circuitBreakerEnabled,
    failureThreshold: mechanisms.failureThreshold,
    recoveryMs: mechanisms.recoveryMs,
    cacheEnabled: mechanisms.cacheEnabled,
    queueEnabled: mechanisms.queueEnabled,
  }
}

/**
 * Applies a scenario's failures to a fresh system, keeping the visitor's
 * resilience mechanisms so they can compare with and without them.
 */
export function scenarioConfig(scenario: Scenario, mechanisms: ResilienceConfig = DEFAULT_CONFIG): ResilienceConfig {
  return { ...withMechanisms(mechanisms), ...scenario.failure }
}
