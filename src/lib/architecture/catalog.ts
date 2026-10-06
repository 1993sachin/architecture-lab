import type { ComponentCategory, ComponentConfig, ComponentType } from './types'

export interface ComponentDefinition {
  type: ComponentType
  label: string
  category: ComponentCategory
  description: string
  defaults: ComponentConfig
  /** Relative monthly cost of one instance in one region, in arbitrary units. */
  cost: number
}

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  compute: 'Compute',
  data: 'Data',
  messaging: 'Messaging',
  infrastructure: 'Infrastructure',
  observability: 'Observability',
}

export const CATEGORIES: ComponentCategory[] = ['compute', 'data', 'messaging', 'infrastructure', 'observability']

const def = (
  type: ComponentType,
  label: string,
  category: ComponentCategory,
  description: string,
  cost: number,
  defaults: ComponentConfig = {},
): ComponentDefinition => ({ type, label, category, description, cost, defaults })

export const COMPONENTS: ComponentDefinition[] = [
  def('client', 'Client', 'compute', 'Browser or mobile app making requests', 0),
  def('webapp', 'Web App', 'compute', 'Server-rendered frontend', 2, { instances: 2, autoscaling: false }),
  def('gateway', 'API Gateway', 'compute', 'Single entry point: routing, auth, throttling', 3, { instances: 2 }),
  def('loadBalancer', 'Load Balancer', 'compute', 'Spreads traffic across instances', 2, { instances: 2 }),
  def('service', 'Service', 'compute', 'Stateless application service', 3, {
    instances: 1,
    autoscaling: false,
    cpu: 'medium',
    protocol: 'http',
  }),
  def('worker', 'Worker', 'compute', 'Background consumer for queued work', 2, { instances: 1, autoscaling: false }),
  def('function', 'Serverless Function', 'compute', 'Event-driven, scales to zero', 1, { autoscaling: true }),

  def('sql', 'SQL Database', 'data', 'Relational, transactional, strongly consistent', 6, {
    readCapacity: 'medium',
    writeCapacity: 'medium',
    replication: 'none',
    regions: 1,
  }),
  def('nosql', 'NoSQL Database', 'data', 'Partitioned key-value or document store', 5, {
    readCapacity: 'medium',
    writeCapacity: 'medium',
    replication: 'replicas',
    regions: 1,
  }),
  def('cache', 'Cache', 'data', 'In-memory key-value store, e.g. Redis', 3, {
    ttl: 300,
    cacheStrategy: 'cache-aside',
    eviction: 'lru',
    replication: 'none',
  }),
  def('objectStorage', 'Object Storage', 'data', 'Durable blobs: video, images, backups', 2, { replication: 'replicas' }),
  def('search', 'Search Engine', 'data', 'Full-text and faceted search index', 5, { replication: 'replicas' }),

  def('queue', 'Message Queue', 'messaging', 'Point-to-point work queue with retries', 2),
  def('eventBus', 'Event Bus', 'messaging', 'Publish/subscribe events to many consumers', 2),
  def('stream', 'Stream', 'messaging', 'Ordered, replayable event log, e.g. Kafka', 4),

  def('cdn', 'CDN', 'infrastructure', 'Edge caches close to users', 3, { regions: 3, ttl: 3600 }),
  def('dns', 'DNS', 'infrastructure', 'Name resolution and geo-routing', 1),
  def('auth', 'Authentication', 'infrastructure', 'Identity, sessions and tokens', 2),
  def('rateLimiter', 'Rate Limiter', 'infrastructure', 'Caps requests per client or tenant', 1),

  def('logging', 'Logging', 'observability', 'Centralized logs', 1),
  def('metrics', 'Metrics', 'observability', 'Dashboards and alerts', 1),
  def('tracing', 'Tracing', 'observability', 'Follow a request across services', 1),
]

export const COMPONENT_BY_TYPE = Object.fromEntries(COMPONENTS.map((c) => [c.type, c])) as Record<
  ComponentType,
  ComponentDefinition
>

/** Groups used by the rules. */
export const GROUPS = {
  entry: ['client', 'webapp'] as ComponentType[],
  compute: ['webapp', 'service', 'worker', 'function'] as ComponentType[],
  database: ['sql', 'nosql'] as ComponentType[],
  dataStore: ['sql', 'nosql', 'cache', 'objectStorage', 'search'] as ComponentType[],
  messaging: ['queue', 'eventBus', 'stream'] as ComponentType[],
  observability: ['logging', 'metrics', 'tracing'] as ComponentType[],
  /** Components that should run more than one copy on a critical path. */
  replicable: ['webapp', 'gateway', 'loadBalancer', 'service'] as ComponentType[],
}

export function defaultConfig(type: ComponentType): ComponentConfig {
  return { ...COMPONENT_BY_TYPE[type].defaults }
}
