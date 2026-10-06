import { DEFAULT_CONFIG } from './engine'
import type { MfeConfig } from './types'

export interface MfePreset {
  id: string
  label: string
  description: string
  config: MfeConfig
}

/** One-click scenarios that get a first-time visitor to an insight fast. */
export const MFE_PRESETS: MfePreset[] = [
  {
    id: 'isolated-failure',
    label: 'Take Workspace offline',
    description: 'See a failure contained to one microfrontend.',
    config: { ...DEFAULT_CONFIG, failures: ['workspace'] },
  },
  {
    id: 'monolith-failure',
    label: 'Same failure in a monolith',
    description: 'One crash, whole page down.',
    config: { ...DEFAULT_CONFIG, mode: 'monolith', failures: ['workspace'] },
  },
  {
    id: 'eager-dead-remote',
    label: 'Eager-load a dead remote',
    description: 'Startup now waits on every module.',
    config: { ...DEFAULT_CONFIG, failures: ['analytics'], lazyLoading: false },
  },
  {
    id: 'flaky-api-cache',
    label: 'Flaky API with a cache',
    description: 'Watch the cache absorb errors.',
    config: { ...DEFAULT_CONFIG, apiFailureRate: 0.3, caching: true },
  },
]
