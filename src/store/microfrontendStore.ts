import { create } from 'zustand'
import { DEFAULT_CONFIG, type ControlKey, type MfeConfig } from '@/lib/simulation/microfrontend'

interface MicrofrontendStore {
  config: MfeConfig
  running: boolean
  /** The most recent control the visitor changed, used to explain the trade-off. */
  lastChange: ControlKey | null
  /** Bumped on reset so the simulation hook can start a fresh run. */
  runId: number
  setControl: <K extends ControlKey>(key: K, value: MfeConfig[K]) => void
  applyPreset: (config: MfeConfig) => void
  toggleRunning: () => void
  reset: () => void
}

export const useMicrofrontendStore = create<MicrofrontendStore>()((set) => ({
  config: DEFAULT_CONFIG,
  running: true,
  lastChange: null,
  runId: 0,
  setControl: (key, value) =>
    set((s) => {
      const config = { ...s.config, [key]: value }
      // A monolith is always deployed as one unit.
      if (key === 'mode' && value === 'monolith') config.independentDeployment = false
      if (key === 'mode' && value === 'microfrontends') config.independentDeployment = true
      return { config, lastChange: key, running: true }
    }),
  applyPreset: (config) => set((s) => ({ config, lastChange: 'failure', running: true, runId: s.runId + 1 })),
  toggleRunning: () => set((s) => ({ running: !s.running })),
  reset: () => set((s) => ({ config: DEFAULT_CONFIG, lastChange: null, running: true, runId: s.runId + 1 })),
}))
