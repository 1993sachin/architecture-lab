/** Health of a node in any architecture diagram. */
export type NodeStatus = 'healthy' | 'degraded' | 'warning' | 'failed' | 'offline' | 'recovering' | 'circuit-open'

/** Traffic state of a connection between two nodes. */
export type FlowState = 'ok' | 'degraded' | 'failed' | 'idle' | 'retry' | 'queued'
