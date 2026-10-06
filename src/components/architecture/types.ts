import type { Edge, Node } from '@xyflow/react'
import type { FlowState, NodeStatus } from '@/types/status'

export type ComponentKind =
  | 'client'
  | 'shell'
  | 'mfe'
  | 'api'
  | 'gateway'
  | 'service'
  | 'database'
  | 'cache'
  | 'queue'
  | 'cdn'
  | 'storage'
  | 'search'
  | 'analytics'
  | 'auth'
  | 'loadbalancer'

export interface NodeAction {
  label: string
  /** Accessible description, e.g. "Take Workspace offline". */
  ariaLabel: string
  pressed: boolean
  onClick: () => void
}

export type ArchitectureNodeData = {
  label: string
  kind: ComponentKind
  status: NodeStatus
  subtitle?: string
  badges?: string[]
  stats?: Array<{ label: string; value: string }>
  action?: NodeAction
  /** Status text to show instead of the default label, e.g. "Taken down". */
  statusLabel?: string
  [key: string]: unknown
}

export type GroupNodeData = {
  label: string
  sublabel?: string
  tone?: 'neutral' | 'failed'
  [key: string]: unknown
}

export type { FlowState } from '@/types/status'

export type ArchitectureEdgeData = {
  flow: FlowState
  /** Seconds a request dot takes to travel the edge; higher = slower system. */
  duration?: number
  /** Curve style; 'step' draws orthogonal lines, good for bus-like layouts. */
  path?: 'bezier' | 'step'
  [key: string]: unknown
}

export type ArchitectureNodeType = Node<ArchitectureNodeData, 'architecture'>
export type GroupNodeType = Node<GroupNodeData, 'group-boundary'>
export type ArchitectureEdgeType = Edge<ArchitectureEdgeData, 'architecture'>
export type AnyArchitectureNode = ArchitectureNodeType | GroupNodeType
