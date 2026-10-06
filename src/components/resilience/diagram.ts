import {
  SERVICE_LABELS,
  summarizeMetrics,
  type EdgeId,
  type KillableService,
  type NodeId,
  type ResilienceConfig,
  type ResilienceState,
  type ResilienceTopology,
  type StepKind,
  type TraceStep,
} from '@/lib/simulation/resilience'
import type {
  AnyArchitectureNode,
  ArchitectureEdgeType,
  ArchitectureNodeData,
  ComponentKind,
  EdgePulse,
  PulseKind,
} from '@/components/architecture/types'

export type DiagramLayout = 'wide' | 'compact'

type Point = { x: number; y: number }

/**
 * 'wide' follows the reference drawing: one column down to the Order Service,
 * then Payment on the left and Inventory on the right. 'compact' (phones)
 * keeps two narrow columns so nodes stay readable.
 */
const LAYOUTS: Record<DiagramLayout, Record<NodeId, Point>> = {
  wide: {
    client: { x: 300, y: 0 },
    gateway: { x: 300, y: 115 },
    order: { x: 300, y: 230 },
    cache: { x: 580, y: 230 },
    queue: { x: 300, y: 360 },
    payment: { x: 60, y: 480 },
    inventory: { x: 540, y: 480 },
    paymentDb: { x: 60, y: 610 },
    inventoryDb: { x: 540, y: 610 },
  },
  compact: {
    client: { x: 0, y: 0 },
    gateway: { x: 0, y: 130 },
    order: { x: 0, y: 260 },
    cache: { x: 240, y: 130 },
    queue: { x: 240, y: 400 },
    payment: { x: 0, y: 540 },
    inventory: { x: 240, y: 540 },
    paymentDb: { x: 0, y: 690 },
    inventoryDb: { x: 240, y: 690 },
  },
}

interface EdgeSpec {
  id: EdgeId
  source: NodeId
  target: NodeId
  sourceHandle: string
  targetHandle: string
}

function edgeSpecs(config: ResilienceConfig): EdgeSpec[] {
  const down = (id: EdgeId, source: NodeId, target: NodeId): EdgeSpec => ({
    id,
    source,
    target,
    sourceHandle: 'bottom',
    targetHandle: 'top',
  })
  const specs: EdgeSpec[] = [
    down('client-gateway', 'client', 'gateway'),
    down('gateway-order', 'gateway', 'order'),
    down('payment-paymentDb', 'payment', 'paymentDb'),
    down('inventory-inventoryDb', 'inventory', 'inventoryDb'),
  ]
  if (config.cacheEnabled) {
    specs.push({ id: 'order-cache', source: 'order', target: 'cache', sourceHandle: 'right', targetHandle: 'left-in' })
  }
  if (config.queueEnabled) {
    specs.push(
      down('order-queue', 'order', 'queue'),
      down('queue-payment', 'queue', 'payment'),
      down('queue-inventory', 'queue', 'inventory'),
    )
  } else {
    specs.push(down('order-payment', 'order', 'payment'), down('order-inventory', 'order', 'inventory'))
  }
  return specs
}

const PULSE: Record<StepKind, PulseKind> = {
  request: 'request',
  response: 'response',
  retry: 'retry',
  failed: 'failed',
  timeout: 'failed',
  'circuit-open': 'failed',
  'cache-hit': 'cache',
  'cache-miss': 'cache',
  enqueue: 'queued',
}

const KIND: Record<NodeId, ComponentKind> = {
  client: 'client',
  gateway: 'gateway',
  order: 'service',
  payment: 'service',
  inventory: 'service',
  paymentDb: 'database',
  inventoryDb: 'database',
  cache: 'cache',
  queue: 'queue',
}

const SUBTITLE: Record<NodeId, string> = {
  client: 'checkout page',
  gateway: 'POST /orders',
  order: 'orchestrates checkout',
  payment: 'charges the card',
  inventory: 'reserves stock',
  paymentDb: 'postgres · payments',
  inventoryDb: 'postgres · stock',
  cache: 'stock by product · TTL 6 s',
  queue: 'order-fulfilment topic',
}

const BREAKER_LABEL = { closed: 'CB closed', open: 'CB OPEN', 'half-open': 'CB half-open' } as const

export interface DiagramInput {
  config: ResilienceConfig
  sim: ResilienceState
  topology: ResilienceTopology
  /** The hop being animated right now, if any. */
  step: TraceStep | null
  stepKey: string
  stepSeconds: number
  onToggleKill: (service: KillableService) => void
  layout: DiagramLayout
}

/** Turns simulation output into React Flow nodes and edges. Pure. */
export function buildDiagram({ config, sim, topology, step, stepKey, stepSeconds, onToggleKill, layout }: DiagramInput): {
  nodes: AnyArchitectureNode[]
  edges: ArchitectureEdgeType[]
} {
  const positions = LAYOUTS[layout]
  const summary = summarizeMetrics(sim)
  const killable = new Set<NodeId>(['order', 'payment', 'inventory', 'paymentDb'])
  const visible: NodeId[] = ['client', 'gateway', 'order', 'payment', 'inventory', 'paymentDb', 'inventoryDb']
  if (config.cacheEnabled) visible.push('cache')
  if (config.queueEnabled) visible.push('queue')

  const nodes: AnyArchitectureNode[] = visible.map((id) => {
    const status = topology.nodes[id]
    const data: ArchitectureNodeData = { label: SERVICE_LABELS[id], kind: KIND[id], status, subtitle: SUBTITLE[id] }
    const badges: string[] = []

    if (killable.has(id)) {
      const service = id as KillableService
      const down = config.killed.includes(service)
      data.action = {
        label: down ? 'Restore' : 'Kill',
        ariaLabel: down ? `Restore ${SERVICE_LABELS[id]}` : `Kill ${SERVICE_LABELS[id]}`,
        pressed: down,
        onClick: () => onToggleKill(service),
      }
      if (down) badges.push('killed')
    }
    if (id === 'payment' || id === 'inventory') {
      if (config.circuitBreakerEnabled) badges.push(BREAKER_LABEL[sim.breakers[id].state])
      const slow = config.slowdown[id]
      if (slow) badges.push(`+${slow} ms`)
      data.stats = [{ label: 'Calls received, retries included', value: `${sim.metrics.dependencyCalls[id]} calls` }]
    }
    if (id === 'order') {
      badges.push(`timeout ${config.timeoutMs} ms`)
      if (config.retryEnabled) badges.push(`retry ×${config.maxRetries}`)
    }
    if (id === 'gateway') {
      if (config.latencyMs) badges.push(`+${config.latencyMs} ms`)
      if (config.packetLoss) badges.push(`${Math.round(config.packetLoss * 100)}% loss`)
    }
    if (id === 'client') {
      data.stats = [{ label: 'Availability', value: `${(summary.availability * 100).toFixed(1)}%` }]
      if (status === 'failed') data.statusLabel = 'Orders failing'
      else if (status === 'degraded') data.statusLabel = 'Some orders failing'
    }
    if (id === 'paymentDb' && topology.nodes.payment === 'degraded' && config.killed.includes('paymentDb')) {
      data.statusLabel = 'Down'
    }
    if (id === 'payment' && status === 'degraded' && config.killed.includes('paymentDb')) data.statusLabel = 'Database down'
    if (id === 'cache') {
      const last = sim.lastTrace?.cache
      if (last) badges.push(`last ${last.toUpperCase()}`)
      data.stats = [{ label: 'Cache hit rate', value: `${Math.round(summary.cacheHitRate * 100)}% hit` }]
    }
    if (id === 'queue') {
      const q = summary.queue
      badges.push(`${q.queued} queued`, `${q.processing} processing`, `${q.completed} done`)
      if (status === 'degraded') data.statusLabel = 'Backing up'
    }
    if (badges.length) data.badges = badges
    return { id, type: 'architecture', position: positions[id], data }
  })

  const edges: ArchitectureEdgeType[] = edgeSpecs(config).map((spec) => {
    const flow = topology.edges[spec.id] ?? 'ok'
    let pulse: EdgePulse | undefined
    if (step) {
      const forward = step.from === spec.source && step.to === spec.target
      const backward = step.from === spec.target && step.to === spec.source
      if (forward || backward) {
        pulse = { key: stepKey, kind: PULSE[step.kind], reverse: backward, duration: stepSeconds }
      }
    }
    return {
      id: spec.id,
      source: spec.source,
      target: spec.target,
      sourceHandle: spec.sourceHandle,
      targetHandle: spec.targetHandle,
      type: 'architecture',
      data: { flow, ambient: false, pulse },
    }
  })

  return { nodes, edges }
}
