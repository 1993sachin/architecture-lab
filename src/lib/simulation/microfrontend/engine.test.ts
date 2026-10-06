import { describe, expect, it } from 'vitest'
import { Rng } from '@/lib/random'
import {
  DEFAULT_CONFIG,
  HISTORY_LENGTH,
  REQUESTS_PER_TICK,
  computeMetrics,
  createInitialState,
  deriveTopology,
  explainState,
  resolveRequest,
  run,
  type ModuleId,
  step,
  type MfeConfig,
} from '.'

const healthy: MfeConfig = { ...DEFAULT_CONFIG, apiFailureRate: 0, latencyMs: 0 }

describe('microfrontend simulation engine', () => {
  it('is deterministic for the same seed and config', () => {
    const a = run(createInitialState(7), DEFAULT_CONFIG, 30)
    const b = run(createInitialState(7), DEFAULT_CONFIG, 30)
    expect(a).toEqual(b)
  })

  it('does not mutate the previous state', () => {
    const s0 = createInitialState()
    const snapshot = structuredClone(s0)
    step(s0, DEFAULT_CONFIG)
    expect(s0).toEqual(snapshot)
  })

  it('keeps totals consistent and history bounded', () => {
    const s = run(createInitialState(), DEFAULT_CONFIG, HISTORY_LENGTH + 10)
    expect(s.totals.requests).toBe((HISTORY_LENGTH + 10) * REQUESTS_PER_TICK)
    expect(s.totals.succeeded + s.totals.failed).toBe(s.totals.requests)
    expect(s.history).toHaveLength(HISTORY_LENGTH)
  })

  it('serves every request when nothing is broken', () => {
    const m = computeMetrics(run(createInitialState(), healthy, 20))
    expect(m.availability).toBe(1)
    expect(m.failed).toBe(0)
  })

  it('takes the whole monolith down when one module fails', () => {
    const m = computeMetrics(run(createInitialState(), { ...healthy, mode: 'monolith', independentDeployment: false, failures: ['workspace'] as ModuleId[] }, 20))
    expect(m.availability).toBe(0)
  })

  it('isolates the failure to one microfrontend', () => {
    const m = computeMetrics(run(createInitialState(), { ...healthy, failures: ['workspace'] as ModuleId[] }, 60))
    expect(m.moduleErrorRate.workspace).toBe(1)
    expect(m.moduleErrorRate.content).toBe(0)
    expect(m.moduleErrorRate.analytics).toBe(0)
    expect(m.availability).toBeGreaterThan(0.3)
    expect(m.availability).toBeLessThan(0.9)
  })

  it('contains two failed microfrontends to their own slots', () => {
    const cfg = { ...healthy, failures: ['workspace', 'content'] as ModuleId[] }
    const m = computeMetrics(run(createInitialState(), cfg, 60))
    expect(m.moduleErrorRate.workspace).toBe(1)
    expect(m.moduleErrorRate.content).toBe(1)
    expect(m.moduleErrorRate.analytics).toBe(0)
    const e = explainState(cfg, m)
    expect(e.headline).toContain('Workspace and Content MFEs are unavailable')
    expect(e.details.join(' ')).toContain('two independent parts failed')
  })

  it('lets a cache serve stale data for an offline module', () => {
    const cfg = { ...healthy, failures: ['content'] as ModuleId[], caching: true }
    const m = computeMetrics(run(createInitialState(), cfg, 60))
    expect(m.moduleCacheRate.content).toBeGreaterThan(0)
    expect(m.moduleErrorRate.content).toBeLessThan(1)
  })

  it('slows every page when a dead remote is eagerly loaded', () => {
    const lazy = resolveRequest('content', { ...healthy, failures: ['analytics'] as ModuleId[] }, new Rng(1))
    const eager = resolveRequest('content', { ...healthy, failures: ['analytics'] as ModuleId[], lazyLoading: false }, new Rng(1))
    expect(eager.outcome).toBe('ok')
    expect(eager.latency).toBeGreaterThan(lazy.latency + 200)
  })

  it('spreads failures to healthy modules without independent deployment', () => {
    const cfg = { ...healthy, failures: ['workspace'] as ModuleId[], independentDeployment: false }
    const m = computeMetrics(run(createInitialState(), cfg, 80))
    expect(m.moduleErrorRate.content).toBeGreaterThan(0)
  })

  it('adds network latency to microfrontend requests', () => {
    const fast = computeMetrics(run(createInitialState(), healthy, 10)).latency
    const slow = computeMetrics(run(createInitialState(), { ...healthy, latencyMs: 400 }, 10)).latency
    expect(slow).toBeGreaterThan(fast + 400)
  })
})

describe('topology and explanations', () => {
  it('marks the failed module and its edges', () => {
    const cfg = { ...healthy, failures: ['analytics'] as ModuleId[] }
    const t = deriveTopology(cfg, computeMetrics(run(createInitialState(), cfg, 10)))
    expect(t.modules.analytics).toBe('failed')
    expect(t.shellToModule.analytics).toBe('failed')
    expect(t.moduleToApi.analytics).toBe('idle')
    expect(t.modules.workspace).toBe('healthy')
    expect(t.shell).toBe('degraded')
  })

  it('takes every module down in a failed monolith', () => {
    const cfg: MfeConfig = { ...healthy, mode: 'monolith', failures: ['content'] as ModuleId[] }
    const t = deriveTopology(cfg, computeMetrics(run(createInitialState(), cfg, 5)))
    expect(t.shell).toBe('failed')
    expect(t.modules.workspace).toBe('offline')
  })

  it('explains an isolated failure without blaming the healthy modules', () => {
    const cfg = { ...healthy, failures: ['workspace'] as ModuleId[] }
    const e = explainState(cfg, computeMetrics(run(createInitialState(), cfg, 10)))
    expect(e.tone).toBe('warning')
    expect(e.headline).toContain('Workspace MFE is unavailable')
    expect(e.details[0]).toContain('Content and Analytics stay available')
  })
})
