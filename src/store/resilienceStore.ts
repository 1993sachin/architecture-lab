import { create } from 'zustand'
import {
  DEFAULT_CONFIG,
  applyConfigChange,
  clearTimeline,
  createInitialState,
  getScenario,
  scenarioConfig,
  sendRequest,
  type KillableService,
  type ResilienceAction,
  type ResilienceConfig,
  type ResilienceState,
  type ResilienceUrlState,
  type ScenarioId,
  withMechanisms,
} from '@/lib/simulation/resilience'

/** Requests a single burst may queue up, so a stuck button cannot run away. */
const MAX_PENDING = 20

interface ResilienceStore {
  config: ResilienceConfig
  sim: ResilienceState
  /** State before the request being animated, shown until its animation finishes. */
  prevSim: ResilienceState | null
  /** True while a request is travelling the diagram. */
  playing: boolean
  setPlaying: (playing: boolean) => void
  scenarioId: ScenarioId | null
  /** The visitor's last action; "What just happened?" explains it. */
  lastAction: ResilienceAction | null
  /** Requests waiting to be sent; the page sends them one by one so each can be watched. */
  pending: number
  autoTraffic: boolean
  queueRequests: (count: number) => void
  /** Sends the next pending request through the engine. */
  dispatchNext: () => void
  setConfig: (patch: Partial<ResilienceConfig>, action: ResilienceAction) => void
  toggleKill: (service: KillableService) => void
  restoreAll: () => void
  loadScenario: (id: ScenarioId) => void
  resetScenario: () => void
  reset: () => void
  clearTimeline: () => void
  toggleAutoTraffic: () => void
  /** Applies state from a shared link. */
  hydrate: (url: ResilienceUrlState) => void
}

const fresh = () => createInitialState()

export const useResilienceStore = create<ResilienceStore>()((set, get) => ({
  config: DEFAULT_CONFIG,
  sim: fresh(),
  prevSim: null,
  playing: false,
  setPlaying: (playing) => set({ playing }),
  scenarioId: null,
  lastAction: null,
  pending: 0,
  autoTraffic: false,

  queueRequests: (count) => set((s) => ({ pending: Math.min(MAX_PENDING, s.pending + count) })),

  dispatchNext: () =>
    set((s) => {
      if (s.pending <= 0) return s
      return {
        sim: sendRequest(s.sim, s.config),
        prevSim: s.sim,
        // Set here, not after the first animation frame, so the new numbers never flash early.
        playing: true,
        pending: s.pending - 1,
        lastAction: { kind: 'request', count: 1 },
      }
    }),

  setConfig: (patch, action) =>
    set((s) => {
      const next: ResilienceConfig = { ...s.config, ...patch }
      if (patch.killed) next.killed = [...patch.killed].sort()
      return { config: next, sim: applyConfigChange(s.sim, s.config, next), prevSim: null, lastAction: action }
    }),

  toggleKill: (service) => {
    const { config, setConfig } = get()
    const down = config.killed.includes(service)
    const killed = down ? config.killed.filter((k) => k !== service) : [...config.killed, service]
    setConfig({ killed }, down ? { kind: 'restore', service } : { kind: 'kill', service })
  },

  restoreAll: () => {
    const { config, setConfig } = get()
    setConfig(
      { killed: [], latencyMs: 0, packetLoss: 0, slowdown: {}, timeoutMs: DEFAULT_CONFIG.timeoutMs },
      { kind: 'restore', service: config.killed.length === 1 ? config.killed[0] : 'all' },
    )
  },

  loadScenario: (id) => {
    const scenario = getScenario(id)
    if (!scenario) return
    set((s) => {
      const config = scenarioConfig(scenario, s.config)
      // A scenario starts a fresh run so its metrics are not mixed with earlier traffic.
      const sim = applyConfigChange(fresh(), DEFAULT_CONFIG, config)
      return { config, sim, prevSim: null, scenarioId: id, lastAction: { kind: 'scenario', id }, pending: 0 }
    })
  },

  resetScenario: () => {
    const { scenarioId, loadScenario } = get()
    if (scenarioId) {
      loadScenario(scenarioId)
      return
    }
    set((s) => {
      const config = withMechanisms(s.config)
      return { config, sim: fresh(), prevSim: null, lastAction: { kind: 'restore', service: 'all' }, pending: 0 }
    })
  },

  reset: () =>
    set({
      config: DEFAULT_CONFIG,
      sim: fresh(),
      prevSim: null,
      scenarioId: null,
      lastAction: { kind: 'reset' },
      pending: 0,
      autoTraffic: false,
    }),

  clearTimeline: () => set((s) => ({ sim: clearTimeline(s.sim), prevSim: s.prevSim && clearTimeline(s.prevSim) })),

  toggleAutoTraffic: () => set((s) => ({ autoTraffic: !s.autoTraffic })),

  hydrate: ({ scenarioId, config }) =>
    set({
      config,
      scenarioId,
      sim: applyConfigChange(fresh(), DEFAULT_CONFIG, config),
      prevSim: null,
      lastAction: scenarioId ? { kind: 'scenario', id: scenarioId } : null,
      pending: 0,
    }),
}))

/**
 * The state the visitor should see: while a request is still travelling the
 * diagram, metrics and panels keep showing the state from before it, so
 * numbers change when the request arrives rather than when it leaves.
 */
export const useVisibleSim = () => useResilienceStore((s) => (s.playing && s.prevSim ? s.prevSim : s.sim))
