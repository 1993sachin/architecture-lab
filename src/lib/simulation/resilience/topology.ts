import type { FlowState, NodeStatus } from '@/types/status'
import { DEPENDENCIES, type DependencyId, type NodeId, type ResilienceConfig, type ResilienceState } from './types'

export type EdgeId =
  | 'client-gateway'
  | 'gateway-order'
  | 'order-inventory'
  | 'order-payment'
  | 'order-cache'
  | 'order-queue'
  | 'queue-inventory'
  | 'queue-payment'
  | 'payment-paymentDb'
  | 'inventory-inventoryDb'

export interface ResilienceTopology {
  nodes: Record<NodeId, NodeStatus>
  edges: Partial<Record<EdgeId, FlowState>>
}

/** How many of the latest requests decide whether the client looks degraded. */
const CLIENT_WINDOW = 5

const killed = (config: ResilienceConfig, id: string) => (config.killed as string[]).includes(id)

function dependencyStatus(dep: DependencyId, config: ResilienceConfig, state: ResilienceState): NodeStatus {
  // From the caller's side an open circuit is what matters: nothing reaches the service.
  const breaker = state.breakers[dep]
  if (config.circuitBreakerEnabled && breaker.state === 'open') return 'circuit-open'
  if (killed(config, dep)) return 'failed'
  if (config.circuitBreakerEnabled && breaker.state === 'half-open') return 'recovering'
  const warming = state.recoveringUntil[dep]
  if (warming !== undefined && state.clock < warming) return 'recovering'
  if (dep === 'payment' && killed(config, 'paymentDb')) return 'degraded'
  if ((config.slowdown[dep] ?? 0) > 0) return 'degraded'
  return 'healthy'
}

/**
 * Health of every component and connection, from the configuration plus
 * what recent requests actually experienced. Pure.
 */
export function deriveTopology(config: ResilienceConfig, state: ResilienceState): ResilienceTopology {
  const network: FlowState = config.packetLoss > 0 || config.latencyMs >= 500 ? 'degraded' : 'ok'
  const warmingOrder = state.recoveringUntil.order !== undefined && state.clock < state.recoveringUntil.order

  const payment = dependencyStatus('payment', config, state)
  const inventory = dependencyStatus('inventory', config, state)
  const order: NodeStatus = killed(config, 'order') ? 'failed' : warmingOrder ? 'recovering' : 'healthy'

  // The client sees the system from the outside: recent outcomes decide its state.
  const window = state.recent.slice(-CLIENT_WINDOW)
  const recentFailures = window.filter((r) => !r.ok).length
  const client: NodeStatus =
    window.length > 0 && recentFailures === window.length ? 'failed' : recentFailures > 0 ? 'degraded' : 'healthy'
  const gateway: NodeStatus = order === 'failed' ? 'degraded' : network === 'degraded' ? 'warning' : 'healthy'

  const backlog = state.queue.filter((m) => m.status !== 'completed').length
  const blocked = state.queue.some((m) => m.status === 'queued' && m.waitingOn)

  const nodes: Record<NodeId, NodeStatus> = {
    client,
    gateway,
    order,
    payment,
    inventory,
    paymentDb: killed(config, 'paymentDb') ? 'failed' : 'healthy',
    inventoryDb: 'healthy',
    cache: 'healthy',
    queue: blocked ? 'degraded' : backlog > 6 ? 'warning' : 'healthy',
  }

  const lastRetried = new Set(state.lastTrace?.steps.filter((s) => s.kind === 'retry').map((s) => s.to) ?? [])
  const callFlow = (dep: DependencyId): FlowState => {
    const status = nodes[dep]
    if (status === 'failed') return 'failed'
    if (status === 'circuit-open') return 'idle'
    if (lastRetried.has(dep)) return 'retry'
    if (status === 'degraded' || network === 'degraded') return 'degraded'
    return 'ok'
  }

  const edges: ResilienceTopology['edges'] = {
    'client-gateway': network,
    'gateway-order': order === 'failed' ? 'failed' : network,
    'payment-paymentDb': nodes.paymentDb === 'failed' ? 'failed' : payment === 'failed' ? 'idle' : 'ok',
    'inventory-inventoryDb': inventory === 'failed' ? 'idle' : 'ok',
  }
  if (order === 'failed') {
    edges['payment-paymentDb'] = nodes.paymentDb === 'failed' ? 'failed' : 'idle'
    edges['inventory-inventoryDb'] = 'idle'
  }
  if (config.cacheEnabled) edges['order-cache'] = order === 'failed' ? 'idle' : 'ok'

  if (config.queueEnabled) {
    edges['order-queue'] = order === 'failed' ? 'idle' : backlog > 0 ? 'queued' : 'ok'
    for (const dep of DEPENDENCIES) {
      const id = `queue-${dep}` as const
      const status = nodes[dep]
      edges[id] = status === 'failed' ? 'failed' : blocked ? 'queued' : backlog > 0 ? 'queued' : 'ok'
    }
  } else {
    for (const dep of DEPENDENCIES) edges[`order-${dep}`] = order === 'failed' ? 'idle' : callFlow(dep)
  }

  return { nodes, edges }
}

/** Plain-text summary for screen readers. */
export function describeTopology(topology: ResilienceTopology, config: ResilienceConfig): string {
  const n = topology.nodes
  const parts = [
    `Order Service ${n.order}`,
    `Payment Service ${n.payment}`,
    `Inventory Service ${n.inventory}`,
    `Payment Database ${n.paymentDb}`,
  ]
  if (config.cacheEnabled) parts.push('Redis cache enabled')
  if (config.queueEnabled) parts.push(`message queue ${n.queue}`)
  return `Order system: Client, API Gateway, Order Service calling Payment and Inventory. ${parts.join(', ')}.`
}
