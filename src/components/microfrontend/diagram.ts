import {
  MODULES,
  MODULE_LABELS,
  type MfeConfig,
  type MfeMetrics,
  type MfeTopology,
  type ModuleId,
} from '@/lib/simulation/microfrontend'
import type { AnyArchitectureNode, ArchitectureEdgeType, NodeAction } from '@/components/architecture/types'

export type DiagramLayout = 'wide' | 'compact'

const ROW: Record<ModuleId, number> = { workspace: 0, content: 1, analytics: 2 }

/**
 * Two layouts: 'wide' puts the modules side by side under the shell; 'compact'
 * (phones) stacks them in a column with each API to the right, so nodes stay
 * readable without zooming out.
 */
const LAYOUTS = {
  wide: {
    shell: { x: 260, y: 40 },
    module: (id: ModuleId) => ({ x: ROW[id] * 260, y: 210 }),
    api: (id: ModuleId) => ({ x: ROW[id] * 260, y: 400 }),
    boundary: { x: -24, y: 0, width: 768, height: 330 },
    shellEdge: { sourceHandle: 'bottom', targetHandle: 'top', path: 'bezier' },
    apiEdge: { sourceHandle: 'bottom', targetHandle: 'top' },
  },
  compact: {
    shell: { x: 0, y: 0 },
    module: (id: ModuleId) => ({ x: 0, y: 150 + ROW[id] * 130 }),
    api: (id: ModuleId) => ({ x: 240, y: 150 + ROW[id] * 130 }),
    boundary: { x: -56, y: -40, width: 280, height: 560 },
    shellEdge: { sourceHandle: 'left-out', targetHandle: 'left-in', path: 'step' },
    apiEdge: { sourceHandle: 'right', targetHandle: 'left-in' },
  },
} as const

/** Pretend per-team versions, to make independent releases visible. */
const VERSIONS: Record<ModuleId, string> = { workspace: '2.14.0', content: '1.9.3', analytics: '3.2.1' }

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Turns simulation output into React Flow nodes and edges. Pure. */
export function buildDiagram(
  config: MfeConfig,
  metrics: MfeMetrics,
  topology: MfeTopology,
  onToggleModule: (id: ModuleId) => void,
  layoutName: DiagramLayout = 'wide',
): { nodes: AnyArchitectureNode[]; edges: ArchitectureEdgeType[] } {
  const layout = LAYOUTS[layoutName]
  const isMfe = config.mode === 'microfrontends'
  const failing = config.failure === 'none' ? null : config.failure
  const nodes: AnyArchitectureNode[] = []
  const edges: ArchitectureEdgeType[] = []
  // Dots move slower as latency rises, so a slow system looks slow.
  const duration = Math.min(3.2, 0.9 + metrics.latency / 220)

  if (!isMfe) {
    nodes.push({
      id: 'monolith-boundary',
      type: 'group-boundary',
      position: { x: layout.boundary.x, y: layout.boundary.y },
      width: layout.boundary.width,
      height: layout.boundary.height,
      selectable: false,
      draggable: false,
      focusable: false,
      zIndex: -1,
      data: {
        label: 'app.bundle.js',
        sublabel: 'one build · one deployment · one runtime',
        tone: failing ? 'failed' : 'neutral',
      },
    })
  }

  nodes.push({
    id: 'shell',
    type: 'architecture',
    position: layout.shell,
    data: {
      label: isMfe ? 'Application Shell' : 'App Router',
      kind: 'shell',
      status: topology.shell,
      subtitle: isMfe ? 'host · composes MFEs at runtime' : 'routes to in-bundle modules',
      statusLabel: failing && !isMfe ? 'Crashed' : failing && !config.lazyLoading && isMfe ? 'Slow start' : undefined,
      badges: isMfe ? ['host', config.lazyLoading ? 'lazy' : 'eager'] : ['router', config.lazyLoading ? 'code-split' : 'single chunk'],
      stats: [{ label: 'Requests per second', value: `${metrics.requestsPerSecond.toFixed(0)}/s` }],
    },
  })

  for (const id of MODULES) {
    const status = topology.modules[id]
    const isDown = failing === id
    const action: NodeAction = {
      label: isDown ? 'Restore' : 'Kill',
      ariaLabel: isDown ? `Restore ${MODULE_LABELS[id]}` : `Take ${MODULE_LABELS[id]} offline`,
      pressed: isDown,
      onClick: () => onToggleModule(id),
    }
    const badges = isMfe
      ? [config.independentDeployment ? `v${VERSIONS[id]}` : 'release-train v12']
      : ['module']
    if (config.caching) badges.push('cache')

    nodes.push({
      id: `mfe-${id}`,
      type: 'architecture',
      position: layout.module(id),
      data: {
        label: isMfe ? `${MODULE_LABELS[id]} MFE` : `${MODULE_LABELS[id]} module`,
        kind: 'mfe',
        status,
        subtitle: isMfe ? `${id}/remoteEntry.js` : `src/${id}/`,
        statusLabel: status === 'offline' ? 'Taken down' : isDown ? 'Offline' : undefined,
        badges,
        action,
        stats:
          status === 'offline' || isDown
            ? undefined
            : [
                { label: 'Requests per second', value: `${metrics.moduleRps[id].toFixed(1)}/s` },
                { label: 'Error rate', value: `${pct(metrics.moduleErrorRate[id])} err` },
              ],
      },
    })

    nodes.push({
      id: `api-${id}`,
      type: 'architecture',
      position: layout.api(id),
      data: {
        label: `${MODULE_LABELS[id]} API`,
        kind: 'api',
        status: topology.apis[id],
        subtitle: `/api/${id}`,
        badges: [`+${config.latencyMs} ms`, `${pct(config.apiFailureRate)} fail`],
      },
    })

    edges.push({
      id: `shell-${id}`,
      source: 'shell',
      target: `mfe-${id}`,
      sourceHandle: layout.shellEdge.sourceHandle,
      targetHandle: layout.shellEdge.targetHandle,
      type: 'architecture',
      data: { flow: topology.shellToModule[id], duration, path: layout.shellEdge.path },
    })
    edges.push({
      id: `${id}-api`,
      source: `mfe-${id}`,
      target: `api-${id}`,
      ...layout.apiEdge,
      type: 'architecture',
      data: { flow: topology.moduleToApi[id], duration },
    })
  }

  return { nodes, edges }
}

/** Plain-text summary of the diagram for screen readers. */
export function describeDiagram(config: MfeConfig, topology: MfeTopology): string {
  const parts = MODULES.map((id) => `${MODULE_LABELS[id]} ${topology.modules[id]}`)
  return `${config.mode === 'microfrontends' ? 'Microfrontend' : 'Monolith'} architecture. Shell ${topology.shell}. ${parts.join(', ')}.`
}
