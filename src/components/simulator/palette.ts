import type { ComponentType } from '@/lib/architecture'
import type { ComponentKind } from '@/components/architecture/types'

/** Drag payload type for palette items. */
export const DRAG_MIME = 'application/x-architecture-lab-component'

/** Maps design component types to the shared diagram's icon kinds. */
export const KIND_OF: Record<ComponentType, ComponentKind> = {
  client: 'client',
  webapp: 'webapp',
  gateway: 'gateway',
  loadBalancer: 'loadbalancer',
  service: 'service',
  worker: 'worker',
  function: 'function',
  sql: 'database',
  nosql: 'nosql',
  cache: 'cache',
  objectStorage: 'storage',
  search: 'search',
  queue: 'queue',
  eventBus: 'eventBus',
  stream: 'stream',
  cdn: 'cdn',
  dns: 'dns',
  auth: 'auth',
  rateLimiter: 'rateLimiter',
  logging: 'logging',
  metrics: 'metrics',
  tracing: 'tracing',
}
