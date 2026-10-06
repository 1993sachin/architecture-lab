import '@xyflow/react/dist/style.css'
import type { ReactNode } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
  type ReactFlowProps,
} from '@xyflow/react'
import { cn } from '@/lib/cn'
import { useThemeStore } from '@/store/theme'
import { ArchitectureNode } from './ArchitectureNode'
import { ArchitectureEdge } from './ArchitectureEdge'
import { GroupNode } from './GroupNode'
import type { AnyArchitectureNode, ArchitectureEdgeType } from './types'

// Defined at module level: React Flow re-mounts every node if these change identity.
const nodeTypes: NodeTypes = { architecture: ArchitectureNode, 'group-boundary': GroupNode }
const edgeTypes: EdgeTypes = { architecture: ArchitectureEdge }

interface ArchitectureCanvasProps {
  nodes: AnyArchitectureNode[]
  edges: ArchitectureEdgeType[]
  /** Read by screen readers in place of the visual diagram. */
  description: string
  className?: string
  /** Space around the fitted diagram, as a fraction of the viewport. */
  fitPadding?: number
  /** Overlay content, e.g. a legend, positioned by the caller. */
  children?: ReactNode
  /**
   * Design mode: nodes can be selected, connected and deleted. The caller
   * owns the state and receives changes through `editing` handlers.
   */
  editing?: Pick<
    ReactFlowProps<AnyArchitectureNode, ArchitectureEdgeType>,
    | 'onNodesChange'
    | 'onEdgesChange'
    | 'onConnect'
    | 'onNodeClick'
    | 'onEdgeClick'
    | 'onPaneClick'
    | 'onDrop'
    | 'onDragOver'
    | 'onInit'
    | 'onNodeDragStop'
    | 'isValidConnection'
  >
}

/**
 * Read-only, pannable architecture diagram. Simulation state is pushed in as
 * nodes and edges; the canvas never owns any of it.
 */
export function ArchitectureCanvas({
  nodes,
  edges,
  description,
  className,
  fitPadding = 0.12,
  children,
  editing,
}: ArchitectureCanvasProps) {
  const theme = useThemeStore((s) => s.theme)
  return (
    <div className={cn('relative', className)} role="figure" aria-label={description}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: fitPadding, maxZoom: editing ? 1 : undefined }}
        minZoom={0.4}
        maxZoom={1.6}
        nodesDraggable
        nodesConnectable={!!editing}
        elementsSelectable={!!editing}
        edgesFocusable={!!editing}
        connectionMode={editing ? ConnectionMode.Loose : ConnectionMode.Strict}
        deleteKeyCode={editing ? ['Backspace', 'Delete'] : null}
        connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 2 }}
        {...editing}
        zoomOnScroll={false}
        preventScrolling={false}
        panOnScroll={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border-strong)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      {children}
    </div>
  )
}
