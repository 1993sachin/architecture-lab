import { COMPONENT_BY_TYPE, defaultConfig } from './catalog'
import type { Architecture, ComponentConfig, ComponentType } from './types'

/**
 * Tiny builder for designs in tests and examples:
 * design('url-shortener').add('c', 'client').add('s', 'service', { instances: 2 }).link('c', 's').build()
 */
export function design(challengeId: string) {
  const arch: Architecture = { challengeId, nodes: [], edges: [] }
  const api = {
    add(id: string, type: ComponentType, config: ComponentConfig = {}, label?: string) {
      arch.nodes.push({
        id,
        type,
        label: label ?? COMPONENT_BY_TYPE[type].label,
        position: { x: arch.nodes.length * 220, y: 0 },
        config: { ...defaultConfig(type), ...config },
      })
      return api
    },
    link(...chain: string[]) {
      for (let i = 0; i < chain.length - 1; i++)
        arch.edges.push({ id: `${chain[i]}->${chain[i + 1]}`, source: chain[i], target: chain[i + 1] })
      return api
    },
    build: () => structuredClone(arch),
  }
  return api
}
