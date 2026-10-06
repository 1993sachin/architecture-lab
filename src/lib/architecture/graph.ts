import { GROUPS } from './catalog'
import type { Architecture, ComponentType, DesignNode } from './types'

/** Read-only view of a design with the lookups every rule needs. */
export interface Graph {
  arch: Architecture
  nodes: DesignNode[]
  byId: Map<string, DesignNode>
  out: Map<string, DesignNode[]>
  in: Map<string, DesignNode[]>
  /** Nodes a request from an entry point can reach. */
  reachable: Set<string>
}

export function buildGraph(arch: Architecture): Graph {
  const byId = new Map(arch.nodes.map((n) => [n.id, n]))
  const out = new Map<string, DesignNode[]>(arch.nodes.map((n) => [n.id, []]))
  const inn = new Map<string, DesignNode[]>(arch.nodes.map((n) => [n.id, []]))
  for (const e of arch.edges) {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t || s.id === t.id) continue
    out.get(s.id)!.push(t)
    inn.get(t.id)!.push(s)
  }
  const entries = arch.nodes.filter((n) => GROUPS.entry.includes(n.type))
  const starts = entries.length ? entries : arch.nodes.filter((n) => n.type === 'gateway' || n.type === 'dns')
  const reachable = new Set<string>()
  const stack = starts.map((n) => n.id)
  while (stack.length) {
    const id = stack.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const next of out.get(id) ?? []) stack.push(next.id)
  }
  return { arch, nodes: arch.nodes, byId, out, in: inn, reachable }
}

export const ofType = (g: Graph, ...types: ComponentType[]) => g.nodes.filter((n) => types.includes(n.type))
export const has = (g: Graph, ...types: ComponentType[]) => g.nodes.some((n) => types.includes(n.type))
export const degree = (g: Graph, id: string) => (g.out.get(id)?.length ?? 0) + (g.in.get(id)?.length ?? 0)

/** Nodes reachable by following connections from `id` (excluding itself). */
export function downstream(g: Graph, id: string): DesignNode[] {
  const seen = new Set<string>([id])
  const result: DesignNode[] = []
  const stack = [...(g.out.get(id) ?? [])]
  while (stack.length) {
    const n = stack.pop()!
    if (seen.has(n.id)) continue
    seen.add(n.id)
    result.push(n)
    stack.push(...(g.out.get(n.id) ?? []))
  }
  return result
}

/** True when a request from an entry point can reach a node of one of these types. */
export const hasReachable = (g: Graph, ...types: ComponentType[]) =>
  g.nodes.some((n) => types.includes(n.type) && g.reachable.has(n.id))

/** A copy of this component can fail without taking the function down. */
export function isRedundant(node: DesignNode): boolean {
  const c = node.config
  switch (node.type) {
    case 'webapp':
    case 'gateway':
    case 'loadBalancer':
    case 'service':
    case 'worker':
      return (c.instances ?? 1) >= 2 || !!c.autoscaling
    case 'sql':
    case 'nosql':
    case 'cache':
    case 'search':
    case 'objectStorage':
      return (c.replication ?? 'none') !== 'none'
    default:
      // Managed or inherently distributed: functions, CDN, DNS, messaging, observability.
      return true
  }
}

/** Matches a service-like node by the keywords in its name. */
export const labelMatches = (node: DesignNode, keywords: string[]) => {
  const label = node.label.toLowerCase()
  return keywords.some((k) => label.includes(k))
}

export const isComputeLike = (n: DesignNode) => GROUPS.compute.includes(n.type)
