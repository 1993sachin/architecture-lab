import type { FlowState, NodeStatus } from '@/types/status'
import { MODULES, type MfeConfig, type MfeMetrics, type ModuleId } from './types'

export interface MfeTopology {
  shell: NodeStatus
  modules: Record<ModuleId, NodeStatus>
  apis: Record<ModuleId, NodeStatus>
  shellToModule: Record<ModuleId, FlowState>
  moduleToApi: Record<ModuleId, FlowState>
}

function apiStatus(config: MfeConfig): NodeStatus {
  if (config.apiFailureRate >= 0.25 || config.latencyMs >= 500) return 'degraded'
  if (config.apiFailureRate >= 0.1 || config.latencyMs >= 250) return 'warning'
  return 'healthy'
}

function flowFor(status: NodeStatus): FlowState {
  if (status === 'failed') return 'failed'
  if (status === 'offline') return 'idle'
  if (status === 'degraded' || status === 'warning') return 'degraded'
  return 'ok'
}

/**
 * Maps configuration plus live metrics to the health of every node and edge.
 * Structural failures (an offline module) come from config; softer states
 * (degraded, warning) come from observed error rates so the diagram reflects
 * what the simulation actually measured.
 */
export function deriveTopology(config: MfeConfig, metrics: MfeMetrics): MfeTopology {
  const isMfe = config.mode === 'microfrontends'
  const failing = config.failure === 'none' ? null : config.failure
  const api = apiStatus(config)

  const modules = {} as Record<ModuleId, NodeStatus>
  const apis = {} as Record<ModuleId, NodeStatus>
  const shellToModule = {} as Record<ModuleId, FlowState>
  const moduleToApi = {} as Record<ModuleId, FlowState>

  for (const id of MODULES) {
    let status: NodeStatus
    if (failing === id) status = 'failed'
    else if (failing && !isMfe) status = 'offline'
    else {
      const err = metrics.moduleErrorRate[id]
      status = err >= 0.2 ? 'degraded' : err >= 0.05 ? 'warning' : 'healthy'
    }
    modules[id] = status
    apis[id] = api
    shellToModule[id] = flowFor(status)
    moduleToApi[id] = status === 'failed' || status === 'offline' ? 'idle' : flowFor(api)
  }

  let shell: NodeStatus = 'healthy'
  if (failing && !isMfe) shell = 'failed'
  else if (failing && !config.lazyLoading) shell = 'warning'
  else if (failing) shell = 'degraded'

  return { shell, modules, apis, shellToModule, moduleToApi }
}
