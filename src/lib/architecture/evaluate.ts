import { COMPONENT_BY_TYPE, GROUPS } from './catalog'
import { getChallenge } from './challenges'
import { buildGraph, has, hasReachable, isComputeLike, isRedundant, labelMatches, ofType, type Graph } from './graph'
import {
  DIMENSIONS,
  type Architecture,
  type ArchitectureEvaluation,
  type Challenge,
  type ChallengeProfile,
  type DesignNode,
  type Dimension,
  type Insight,
  type InsightSeverity,
  type Recommendation,
  type Score,
  type ScoreFactor,
  type Tradeoff,
} from './types'

/**
 * Rule-based architecture evaluator. Each rule looks at the design graph, the
 * challenge profile and node configuration, then records score factors (with
 * the reason) and insights. Scores are a baseline plus the sum of factors, so
 * every number on screen can be traced to sentences.
 *
 * Pure and offline. A future reviewer (human or AI) can consume the returned
 * evaluation as structured input rather than re-deriving it.
 */

const BASELINE: Record<Dimension, number> = {
  scalability: 5,
  reliability: 5.5,
  performance: 6,
  cost: 10,
  complexity: 10,
  maintainability: 6,
}

/** Shown when no rule moved a dimension, so every score still has a reason. */
const NEUTRAL: Record<Dimension, string> = {
  scalability: 'Nothing in the design helps or limits scaling yet.',
  reliability: 'No redundancy or failure handling to judge yet.',
  performance: 'No component speeds up or slows down requests yet.',
  cost: 'Only a few inexpensive components.',
  complexity: 'Few components: easy to run and reason about.',
  maintainability: 'No structure that helps or hurts change yet.',
}

/** Cost units a budget comfortably covers. */
const BUDGET_UNITS: Record<ChallengeProfile['budget'], number> = { lean: 40, moderate: 80, generous: 150 }

/** What the design contains, from the evaluator's point of view. */
export interface Capabilities {
  entry: boolean
  persistence: boolean
  sql: boolean
  nosql: boolean
  objectStorage: boolean
  cdn: boolean
  cache: boolean
  messaging: boolean
  search: boolean
  auth: boolean
  rateLimiter: boolean
  gateway: boolean
  loadBalancer: boolean
  websocket: boolean
  observability: number
  services: number
}

/** Detects which capabilities a design actually provides (connected, not just placed). */
export function detectCapabilities(arch: Architecture, g: Graph = buildGraph(arch)): Capabilities {
  const reach = (...types: Parameters<typeof hasReachable>[1][]) => hasReachable(g, ...types)
  const messagingWithConsumer = ofType(g, ...GROUPS.messaging).some(
    (m) => g.reachable.has(m.id) && (g.out.get(m.id)?.length ?? 0) > 0,
  )
  return {
    entry: has(g, ...GROUPS.entry),
    persistence: reach('sql', 'nosql', 'objectStorage'),
    sql: reach('sql'),
    nosql: reach('nosql'),
    objectStorage: reach('objectStorage'),
    cdn: reach('cdn'),
    cache: reach('cache'),
    messaging: messagingWithConsumer,
    search: reach('search'),
    auth: reach('auth'),
    rateLimiter: reach('rateLimiter'),
    gateway: reach('gateway'),
    loadBalancer: reach('loadBalancer'),
    websocket: g.nodes.some((n) => n.type === 'service' && n.config.protocol === 'websocket' && g.reachable.has(n.id)),
    observability: new Set(ofType(g, ...GROUPS.observability).map((n) => n.type)).size,
    services: g.nodes.filter(
      (n) => (n.type === 'service' || n.type === 'function' || n.type === 'worker') && g.reachable.has(n.id),
    ).length,
  }
}

const REPLICATION_FACTOR = { none: 1, replicas: 2, 'multi-region': 3 } as const

/** Rough monthly cost in units, per node. */
export function estimateNodeCost(node: DesignNode): number {
  const base = COMPONENT_BY_TYPE[node.type].cost
  const c = node.config
  let units = base * Math.max(1, c.instances ?? 1) * Math.max(1, c.regions ?? 1)
  if (c.replication) units *= REPLICATION_FACTOR[c.replication]
  if (c.autoscaling) units *= 1.4
  if (c.cpu === 'large') units *= 1.6
  if (c.cpu === 'small') units *= 0.6
  const capacity = { low: 0.7, medium: 1, high: 1.6 }
  if (c.readCapacity) units *= (capacity[c.readCapacity] + capacity[c.writeCapacity ?? 'medium']) / 2
  return units
}

class Context {
  factors = Object.fromEntries(DIMENSIONS.map((d) => [d, [] as ScoreFactor[]])) as Record<Dimension, ScoreFactor[]>
  strengths: Insight[] = []
  weaknesses: Insight[] = []
  bottlenecks: Insight[] = []
  spofs: Insight[] = []
  recommendations: Recommendation[] = []
  tradeoffs: Tradeoff[] = []

  constructor(
    readonly g: Graph,
    readonly challenge: Challenge,
    readonly caps: Capabilities,
  ) {}

  get p() {
    return this.challenge.profile
  }

  score(dimension: Dimension, rule: string, delta: number, text: string) {
    this.factors[dimension].push({ rule, delta, text })
  }
  strength(id: string, title: string, detail: string, nodeIds: string[] = []) {
    this.strengths.push({ id, title, detail, severity: 'low', nodeIds })
  }
  weakness(id: string, severity: InsightSeverity, title: string, detail: string, nodeIds: string[] = []) {
    this.weaknesses.push({ id, title, detail, severity, nodeIds })
  }
  bottleneck(id: string, severity: InsightSeverity, title: string, detail: string, nodeIds: string[] = []) {
    this.bottlenecks.push({ id, title, detail, severity, nodeIds })
  }
  recommend(rec: Recommendation) {
    if (!this.recommendations.some((r) => r.id === rec.id)) this.recommendations.push(rec)
  }
  tradeoff(t: Tradeoff) {
    if (!this.tradeoffs.some((x) => x.id === t.id)) this.tradeoffs.push(t)
  }
}

const ids = (nodes: DesignNode[]) => nodes.map((n) => n.id)
const names = (nodes: DesignNode[]) => nodes.map((n) => n.label).join(', ')

/* ------------------------------------------------------------------ rules */

function rulePersistence(ctx: Context) {
  if (ctx.caps.persistence) return
  ctx.score('reliability', 'no-persistence', -3, 'Nothing stores data durably; a restart loses everything.')
  ctx.weakness(
    'no-persistence',
    'high',
    'No durable storage',
    'No database or object storage is connected, so data does not survive a restart.',
  )
  ctx.recommend({
    id: 'add-database',
    title: 'Add a database',
    problem: 'Your services have nowhere durable to keep data.',
    why: 'Every requirement in this challenge involves data that must outlive a process.',
    suggestion: 'Connect your services to a SQL or NoSQL database, chosen by the access pattern.',
    severity: 'high',
    improves: ['reliability'],
  })
}

function ruleCdn(ctx: Context) {
  const { p, caps, g } = ctx
  const cdns = ofType(g, 'cdn')
  if (p.media || p.global) {
    if (caps.cdn) {
      ctx.score('performance', 'cdn', p.media ? 2 : 1.2, 'CDN serves content from edges close to users.')
      ctx.score('scalability', 'cdn', p.media ? 1.5 : 0.8, 'CDN absorbs most read traffic before it reaches the origin.')
      ctx.strength(
        'cdn',
        'CDN supports global content delivery',
        'Edge caches answer most requests near the user and shield the origin.',
        ids(cdns),
      )
      ctx.tradeoff({
        id: 'cdn',
        title: 'CDN',
        benefit: 'Lower latency and reduced origin load.',
        cost: 'Caching complexity (invalidation, TTLs) and additional infrastructure.',
        context: p.media ? 'Video is the bulk of your bandwidth, so the CDN carries most of the load.' : undefined,
      })
      const origins = cdns.flatMap((c) => g.out.get(c.id) ?? [])
      if (p.media && !origins.some((o) => o.type === 'objectStorage')) {
        ctx.weakness(
          'cdn-origin',
          'low',
          'CDN is not fronting object storage',
          'Video files live best in object storage with the CDN pulling from it.',
          ids(cdns),
        )
      }
    } else if (p.media) {
      const storage = ofType(g, 'objectStorage')
      ctx.score('performance', 'no-cdn', -2.5, 'Every video byte travels from the origin to the user.')
      ctx.score('scalability', 'no-cdn', -2, 'Origin bandwidth grows linearly with viewers.')
      ctx.weakness(
        'no-cdn',
        'high',
        'No CDN for global video',
        'Global video delivery without a CDN will create unnecessary origin traffic and increase latency.',
        ids(storage),
      )
      ctx.recommend({
        id: 'add-cdn',
        title: 'Add a CDN',
        problem: storage.length
          ? 'Your architecture serves video directly from object storage.'
          : 'Your architecture serves video from your own services.',
        why: 'For global users this increases start-up latency and puts all bandwidth on the origin.',
        suggestion: 'Consider placing a CDN in front of object storage, with the client fetching video through it.',
        severity: 'high',
        improves: ['performance', 'scalability'],
      })
    } else {
      ctx.score('performance', 'no-cdn', -1, 'Users far from your region pay a long round trip for static assets.')
      ctx.weakness(
        'no-cdn',
        'medium',
        'No CDN for global users',
        'Static assets come from one region, so distant users wait longer.',
      )
      ctx.recommend({
        id: 'add-cdn',
        title: 'Add a CDN for static assets',
        problem: 'Users on other continents fetch everything from one region.',
        why: 'Round trips across oceans add hundreds of milliseconds per asset.',
        suggestion: 'Serve static assets through a CDN; keep dynamic APIs at the origin.',
        severity: 'medium',
        improves: ['performance'],
      })
    }
  } else if (caps.cdn) {
    ctx.score('cost', 'cdn-unneeded', -0.4, 'A CDN costs money, and this workload has little cacheable static content.')
    ctx.tradeoff({
      id: 'cdn',
      title: 'CDN',
      benefit: 'Lower latency for cacheable content.',
      cost: 'Extra infrastructure; this challenge serves mostly small, dynamic responses.',
    })
  }
}

function ruleCache(ctx: Context) {
  const { p, caps, g } = ctx
  const caches = ofType(g, 'cache').filter((c) => g.reachable.has(c.id))
  if (p.readHeavy) {
    if (caps.cache) {
      ctx.score('performance', 'cache', 1.5, 'Hot reads come from memory instead of the database.')
      ctx.score('scalability', 'cache', 1, 'The cache absorbs repeated reads, so the database scales further.')
      ctx.strength('cache', 'Cache reduces database pressure', 'Frequently read data is served from memory.', ids(caches))
      ctx.tradeoff({
        id: 'cache',
        title: 'Cache',
        benefit: 'Lower read latency and less database load.',
        cost: 'Stale data, invalidation logic, and another component to run.',
        context: p.strongConsistency
          ? 'Cache improves read latency but may serve stale data. Keep prices and stock at checkout out of it.'
          : undefined,
      })
      const longTtl = caches.filter((c) => (c.config.ttl ?? 300) > 600)
      if (p.strongConsistency && longTtl.length) {
        ctx.score('reliability', 'cache-ttl', -0.5, 'A long TTL on consistency-sensitive data risks acting on stale values.')
        ctx.weakness(
          'cache-ttl',
          'medium',
          'Long cache TTL for consistency-sensitive data',
          `TTL above 10 minutes on ${names(longTtl)} can show stale stock or prices.`,
          ids(longTtl),
        )
        ctx.recommend({
          id: 'cache-ttl',
          title: 'Shorten the cache TTL or invalidate on write',
          problem: 'Cached entries live for a long time.',
          why: 'Shoppers may see stock or prices that changed minutes ago.',
          suggestion: 'Use a short TTL or write-through invalidation, and read critical values from the database at checkout.',
          severity: 'medium',
          improves: ['reliability'],
        })
      }
    } else {
      ctx.score('performance', 'no-cache', -1.5, 'Every read goes to the database.')
      ctx.score('scalability', 'no-cache', -1, 'Read traffic scales the database, the hardest tier to scale.')
      ctx.weakness('no-cache', 'medium', 'No caching for a read-heavy workload', 'Repeated reads all hit the database.')
      const dbs = ofType(g, 'sql', 'nosql')
      ctx.bottleneck(
        'db-reads',
        'medium',
        'Database serves every read',
        'Without a cache, read traffic lands on the database and limits throughput.',
        ids(dbs),
      )
      ctx.recommend({
        id: 'add-cache',
        title: 'Add a cache',
        problem: 'Read-heavy traffic goes straight to the database.',
        why: 'Most requests ask for the same hot data; the database pays for each one.',
        suggestion: 'Put a cache (e.g. Redis) beside the service that serves reads, using cache-aside with a sensible TTL.',
        severity: 'medium',
        improves: ['performance', 'scalability'],
      })
    }
  }
  if (p.realtime) {
    if (caps.cache)
      ctx.strength(
        'presence',
        'Presence kept in memory',
        'Online status changes constantly; an in-memory store keeps it cheap.',
        ids(caches),
      )
    else {
      ctx.score('performance', 'no-presence-store', -0.8, 'Presence updates would hammer the main database.')
      ctx.weakness(
        'no-presence-store',
        'medium',
        'No fast store for presence',
        'Millions of online/offline updates per minute need an in-memory store.',
      )
      ctx.recommend({
        id: 'presence-cache',
        title: 'Keep presence in a cache',
        problem: 'Presence has nowhere fast to live.',
        why: 'Writing every heartbeat to the database wastes its write capacity.',
        suggestion: 'Store presence in an in-memory cache with short TTLs.',
        severity: 'medium',
        improves: ['performance', 'scalability'],
      })
    }
  }
  const writeBack = caches.filter((c) => c.config.cacheStrategy === 'write-back')
  if (writeBack.length) {
    ctx.score('reliability', 'write-back', -0.5, 'Write-back caching can lose writes if the cache node fails.')
    ctx.weakness(
      'write-back',
      'low',
      'Write-back cache can lose writes',
      'Writes are acknowledged before they reach the database.',
      ids(writeBack),
    )
  }
}

function asyncReason(p: ChallengeProfile): string {
  if (p.media) return 'Transcoding a video takes minutes; nobody should wait on it in a request.'
  if (p.realtime) return 'Fanning a message out to every group member should not block the sender.'
  if (p.strongConsistency) return 'Fulfilment, emails and stock updates can happen after the order is accepted.'
  return 'Providers are slow and fail; deliveries need retries without blocking the API.'
}

function ruleMessaging(ctx: Context) {
  const { p, caps, g } = ctx
  const messaging = ofType(g, ...GROUPS.messaging).filter((m) => g.reachable.has(m.id))
  if (caps.messaging) {
    if (p.asyncWork) {
      ctx.score('reliability', 'async', 1.5, 'Work survives consumer failures and is retried from the queue.')
      ctx.score('scalability', 'async', 1.2, 'Producers and consumers scale independently; bursts are buffered.')
      ctx.score('performance', 'async', 0.5, 'Requests return without waiting for slow work.')
      ctx.strength('async', 'Async processing reduces request coupling', asyncReason(p), ids(messaging))
    } else {
      ctx.score('complexity', 'async-unneeded', -0.8, 'Messaging adds moving parts this challenge does not strictly need.')
    }
    ctx.tradeoff({
      id: 'queue',
      title: 'Message queue / asynchronous processing',
      benefit: 'Decouples producers and consumers, absorbs bursts, enables retries.',
      cost: 'Eventual consistency, duplicate handling, and more operational work.',
      context: 'The message queue decouples producers and consumers, but introduces eventual consistency.',
    })
    if (p.rateLimiting && !p.readHeavy)
      ctx.strength(
        'retries',
        'Queue retries failed deliveries',
        'Failed sends go back on the queue instead of being lost.',
        ids(messaging),
      )
  } else if (p.asyncWork) {
    ctx.score('reliability', 'no-async', -1.5, 'Slow or failing work runs inside requests, with no retry buffer.')
    ctx.score('scalability', 'no-async', -1, 'Bursts hit every downstream component at once.')
    ctx.weakness('no-async', p.realtime || p.media ? 'high' : 'medium', 'Everything is synchronous', asyncReason(p))
    ctx.recommend({
      id: 'add-queue',
      title: 'Add a message queue',
      problem: 'Slow or failure-prone work happens inside the request.',
      why: asyncReason(p),
      suggestion: 'Publish the work to a queue (or event bus) and let workers consume it with retries.',
      severity: p.realtime || p.media ? 'high' : 'medium',
      improves: ['reliability', 'scalability'],
    })
  }

  if (p.analytics) {
    const streams = ofType(g, 'stream', 'eventBus').filter((m) => g.reachable.has(m.id))
    const syncAnalytics = g.nodes.filter(
      (n) => isComputeLike(n) && labelMatches(n, ['analytic']) && (g.in.get(n.id) ?? []).some(isComputeLike),
    )
    if (streams.length) {
      ctx.strength(
        'analytics',
        'Analytics events flow asynchronously',
        'Viewing events go through a stream, off the playback path.',
        ids(streams),
      )
    } else if (syncAnalytics.length) {
      ctx.score('performance', 'sync-analytics', -0.8, 'Requests wait for analytics writes.')
      ctx.weakness(
        'sync-analytics',
        'medium',
        'Synchronous analytics increases request latency',
        `${names(syncAnalytics)} is called inside user requests.`,
        ids(syncAnalytics),
      )
    } else {
      ctx.weakness('no-analytics', 'low', 'No analytics pipeline', 'The challenge needs analytics, but no events are captured.')
    }
    if (!streams.length) {
      ctx.recommend({
        id: 'analytics-stream',
        title: 'Send analytics through a stream',
        problem: syncAnalytics.length ? 'Analytics is recorded synchronously.' : 'Nothing captures analytics events.',
        why: 'Viewing events are high volume; recording them inline slows playback requests.',
        suggestion: 'Publish events to a stream and process them with a worker into storage.',
        severity: 'low',
        improves: ['performance', 'scalability'],
      })
    }
  }
}

function ruleDatabase(ctx: Context) {
  const { p, caps, g } = ctx
  const dbs = ofType(g, 'sql', 'nosql').filter((d) => g.reachable.has(d.id))
  const sqls = dbs.filter((d) => d.type === 'sql')
  const nosqls = dbs.filter((d) => d.type === 'nosql')

  if (p.strongConsistency) {
    if (sqls.length) {
      ctx.score('reliability', 'sql-transactions', 1, 'Transactions keep payments and stock correct.')
      ctx.strength(
        'sql-transactions',
        'Transactions where correctness matters',
        'A relational database makes "charge once, never oversell" straightforward.',
        ids(sqls),
      )
    } else if (nosqls.length) {
      ctx.score('reliability', 'nosql-transactions', -1.5, 'Multi-record consistency is harder without transactions.')
      ctx.weakness(
        'nosql-transactions',
        'high',
        'Payments and stock without transactions',
        'NoSQL stores make multi-item, all-or-nothing updates harder to get right.',
        ids(nosqls),
      )
      ctx.recommend({
        id: 'sql-for-orders',
        title: 'Use a relational database for orders and payments',
        problem: 'Checkout data lives in a NoSQL store.',
        why: 'Charging exactly once and never overselling needs atomic updates across records.',
        suggestion: 'Keep orders, payments and stock in SQL; NoSQL can still serve the catalog.',
        severity: 'high',
        improves: ['reliability'],
      })
    }
  }

  if (p.writeHeavy && p.scale >= 2) {
    if (nosqls.length) {
      ctx.score('scalability', 'nosql-writes', 1, 'A partitioned store spreads writes across nodes.')
      ctx.strength(
        'nosql-writes',
        'Partitioned store scales writes',
        'Write-heavy data is spread across partitions.',
        ids(nosqls),
      )
    } else if (sqls.length) {
      const weak = sqls.filter((d) => d.config.writeCapacity !== 'high')
      ctx.score('scalability', 'sql-writes', weak.length ? -1.5 : -0.7, 'All writes go to a single primary.')
      ctx.bottleneck(
        'sql-writes',
        weak.length ? 'high' : 'medium',
        'Single write primary',
        'Every write lands on one SQL primary; at this volume it caps throughput.',
        ids(sqls),
      )
      ctx.recommend({
        id: 'scale-writes',
        title: 'Plan for write scale',
        problem: 'A single SQL primary takes every write.',
        why: 'This workload writes constantly; vertical scaling runs out.',
        suggestion: 'Partition (shard) the data, or move the write-heavy part (history, delivery status) to a NoSQL store.',
        severity: 'medium',
        improves: ['scalability'],
      })
    }
  }

  if (nosqls.length) {
    ctx.tradeoff({
      id: 'nosql',
      title: 'NoSQL',
      benefit: 'Horizontal scalability and flexible schema.',
      cost: 'Transactions across records, joins and ad-hoc queries become harder.',
    })
  }
  if (sqls.length) {
    ctx.tradeoff({
      id: 'sql',
      title: 'SQL',
      benefit: 'Transactions, constraints and flexible queries.',
      cost: 'Writes scale vertically; sharding is a significant project.',
    })
  }

  for (const db of dbs) {
    const rep = db.config.replication ?? 'none'
    if (rep === 'multi-region')
      ctx.score('reliability', `db-multi-region-${db.id}`, 0.8, `${db.label} survives a regional outage.`)
    else if (rep === 'replicas') ctx.score('reliability', `db-replicas-${db.id}`, 0.5, `${db.label} fails over to a replica.`)
    if (p.readHeavy && rep !== 'none')
      ctx.score('scalability', `db-read-replicas-${db.id}`, 0.4, `Replicas of ${db.label} share the read load.`)
    const fanIn = (g.in.get(db.id) ?? []).filter(isComputeLike)
    if (fanIn.length >= 3) {
      ctx.score('scalability', `shared-db-${db.id}`, -1, `${fanIn.length} services share ${db.label}.`)
      ctx.score('maintainability', `shared-db-${db.id}`, -0.5, 'A shared database couples services through its schema.')
      ctx.bottleneck(
        `shared-db-${db.id}`,
        'medium',
        `${db.label} is shared by ${fanIn.length} services`,
        'The database may become the system’s throughput bottleneck, and schema changes now need every team.',
        [db.id, ...ids(fanIn)],
      )
    }
    if (p.scale === 3 && (db.config.readCapacity === 'low' || db.config.writeCapacity === 'low')) {
      ctx.score(
        'scalability',
        `db-capacity-${db.id}`,
        -0.8,
        `${db.label} is provisioned with low capacity for very high traffic.`,
      )
      ctx.bottleneck(
        `db-capacity-${db.id}`,
        'medium',
        `${db.label} capacity is low`,
        'Low read or write capacity will saturate at this scale.',
        [db.id],
      )
    }
  }

  if (p.global && dbs.length && dbs.every((d) => (d.config.regions ?? 1) === 1 && d.config.replication !== 'multi-region')) {
    ctx.score('performance', 'db-one-region', -0.5, 'Data lives in one region; distant users pay the round trip.')
  }

  if (p.media && !caps.objectStorage) {
    ctx.score('reliability', 'no-object-storage', -1, 'Video in a database or on servers is hard to keep durable and cheap.')
    ctx.score('cost', 'no-object-storage', -1, 'Storing hundreds of TB outside object storage is expensive.')
    ctx.weakness(
      'no-object-storage',
      'high',
      'No object storage for video',
      'Large files belong in object storage, not in databases or on service disks.',
    )
    ctx.recommend({
      id: 'add-object-storage',
      title: 'Store video in object storage',
      problem: 'There is no durable home for large video files.',
      why: 'Object storage is built for huge, immutable files: cheap, durable and CDN-friendly.',
      suggestion: 'Upload video to object storage and serve it through a CDN.',
      severity: 'high',
      improves: ['reliability', 'cost'],
    })
  }

  if (!p.strongConsistency && !p.media && dbs.some((d) => (d.config.replication ?? 'none') !== 'none')) {
    ctx.strength(
      'durable',
      'Data is stored durably',
      'Replicated storage keeps data safe if a node fails.',
      ids(dbs.filter((d) => d.config.replication !== 'none')),
    )
  }
}

function ruleCompute(ctx: Context) {
  const { p, caps, g } = ctx
  const services = g.nodes.filter((n) => (n.type === 'service' || n.type === 'webapp') && g.reachable.has(n.id))
  const scaled = services.filter((s) => s.config.autoscaling)
  if (scaled.length) {
    ctx.score('scalability', 'autoscaling', Math.min(1.2, 0.5 * scaled.length), 'Autoscaling adds instances when traffic rises.')
    ctx.strength('autoscaling', 'Autoscaling absorbs peaks', `${names(scaled)} grow with traffic.`, ids(scaled))
    ctx.tradeoff({
      id: 'autoscaling',
      title: 'Autoscaling',
      benefit: 'Capacity follows demand; you pay less off-peak.',
      cost: 'Scale-up lag during sudden spikes, and less predictable bills.',
    })
  }

  for (const s of services) {
    const instances = s.config.instances ?? 1
    const upstream = g.in.get(s.id) ?? []
    if (
      (instances >= 2 || s.config.autoscaling) &&
      upstream.some((u) => u.type === 'client' || u.type === 'cdn') &&
      !upstream.some((u) => u.type === 'loadBalancer' || u.type === 'gateway')
    ) {
      ctx.score(
        'reliability',
        `no-lb-${s.id}`,
        -0.5,
        `${s.label} runs several instances with nothing spreading traffic across them.`,
      )
      ctx.weakness(
        `no-lb-${s.id}`,
        'medium',
        `No load balancer in front of ${s.label}`,
        'Multiple instances need a load balancer (or gateway) to share traffic and route around failures.',
        [s.id],
      )
      ctx.recommend({
        id: `add-lb-${s.id}`,
        title: `Put a load balancer in front of ${s.label}`,
        problem: `Clients reach ${s.label} directly although it runs several instances.`,
        why: 'Without a load balancer, one instance takes the traffic and failures are not routed around.',
        suggestion: 'Add a Load Balancer (or route through the API Gateway) in front of the service.',
        severity: 'medium',
        improves: ['reliability', 'scalability'],
      })
    }
  }

  const coreSingles = services.filter((s) => !isRedundant(s))
  if (coreSingles.length) {
    ctx.score(
      'scalability',
      'single-instance',
      -Math.min(2.5, 1.2 * coreSingles.length),
      `${names(coreSingles)} ${coreSingles.length === 1 ? 'runs' : 'run'} as a single instance.`,
    )
    for (const s of coreSingles) {
      ctx.bottleneck(
        `single-instance-${s.id}`,
        p.scale >= 2 ? 'high' : 'medium',
        `${s.label} cannot scale horizontally`,
        `Your architecture has limited horizontal scalability because ${s.label} has no replication.`,
        [s.id],
      )
    }
    ctx.recommend({
      id: 'scale-services',
      title: 'Run more than one instance of each service',
      problem: `${names(coreSingles)} ${coreSingles.length === 1 ? 'runs' : 'run'} as a single instance.`,
      why: 'One instance caps throughput and goes down with every deploy or crash.',
      suggestion: 'Set instances to 2 or more, or enable autoscaling, behind a load balancer.',
      severity: p.scale >= 2 ? 'high' : 'medium',
      improves: ['scalability', 'reliability'],
    })
  }

  if (services.length && !coreSingles.length) {
    ctx.score('scalability', 'horizontal', 1, 'Every service on the request path runs several instances.')
  }

  if (caps.services >= 3) {
    ctx.score('maintainability', 'services', 1, 'Separate services can be changed and deployed independently.')
    ctx.score('scalability', 'services', 0.5, 'Each service scales with its own load.')
    ctx.strength(
      'services',
      'Service separation supports independent scaling',
      `${caps.services} services split the domain into deployable parts.`,
    )
    ctx.tradeoff({
      id: 'microservices',
      title: 'Microservices',
      benefit: 'Independent scaling and deployment per team.',
      cost: 'Operational and network complexity: more deploys, more failure modes, distributed debugging.',
    })
  } else if (caps.services <= 1 && ctx.challenge.functional.length >= 6) {
    ctx.score('maintainability', 'one-service', -0.8, 'One service owns every feature.')
    ctx.weakness(
      'one-service',
      'low',
      'One service does everything',
      'Simple to run, but every change touches the same codebase and deploy.',
    )
    ctx.tradeoff({
      id: 'monolith',
      title: 'Single service',
      benefit: 'Simple to build, deploy and debug.',
      cost: 'Features scale and ship together; one bad change affects everything.',
    })
  }

  if (p.realtime) {
    if (caps.websocket) {
      ctx.score('performance', 'websocket', 1.5, 'Open connections push messages instantly.')
      ctx.strength(
        'websocket',
        'Persistent connections for real-time delivery',
        'WebSocket services push messages without polling.',
      )
    } else {
      ctx.score('performance', 'no-websocket', -2, 'Clients must poll for new messages.')
      ctx.weakness(
        'no-websocket',
        'high',
        'No persistent connections',
        'Chat over request/response means polling: slow delivery and wasted requests.',
      )
      ctx.recommend({
        id: 'websocket',
        title: 'Use WebSocket connections',
        problem: 'No service keeps a connection open to clients.',
        why: 'Polling a million clients is slow and expensive; messages arrive late.',
        suggestion: 'Set the chat-facing service’s protocol to WebSocket and scale it horizontally.',
        severity: 'high',
        improves: ['performance'],
      })
    }
  }
}

function ruleGateway(ctx: Context) {
  const { caps, g } = ctx
  const gateways = ofType(g, 'gateway').filter((n) => g.reachable.has(n.id))
  if (caps.gateway && caps.services >= 2) {
    ctx.score('maintainability', 'gateway', 1, 'One entry point centralizes routing, auth and throttling.')
    ctx.strength(
      'gateway',
      'API gateway gives clients one entry point',
      'Services can change behind it without clients noticing.',
      ids(gateways),
    )
    ctx.tradeoff({
      id: 'gateway',
      title: 'API Gateway',
      benefit: 'Central routing, authentication and rate limiting.',
      cost: 'An API gateway can become a central dependency and requires high availability.',
    })
  } else if (!caps.gateway && !caps.loadBalancer && caps.services >= 3) {
    ctx.score('maintainability', 'no-gateway', -1, 'Clients must know about every service.')
    ctx.weakness(
      'no-gateway',
      'medium',
      'Clients call services directly',
      'Every client knows every service address, so refactoring breaks clients.',
    )
    ctx.recommend({
      id: 'add-gateway',
      title: 'Add an API gateway',
      problem: 'Clients talk to several services directly.',
      why: 'Cross-cutting concerns (auth, throttling, routing) get duplicated, and services cannot move freely.',
      suggestion: 'Route client traffic through an API Gateway.',
      severity: 'medium',
      improves: ['maintainability'],
    })
  }
}

function ruleFeatures(ctx: Context) {
  const { p, caps, g } = ctx
  if (p.search) {
    if (caps.search) {
      ctx.score('performance', 'search', 0.7, 'A search index answers full-text queries quickly.')
      ctx.strength(
        'search',
        'Dedicated search index',
        'Full-text and faceted search do not load the primary database.',
        ids(ofType(g, 'search')),
      )
      ctx.tradeoff({
        id: 'search',
        title: 'Search engine',
        benefit: 'Fast relevance-ranked search.',
        cost: 'A second copy of the data to keep in sync.',
      })
    } else {
      ctx.score('performance', 'no-search', -1, 'Search runs as database queries.')
      ctx.weakness(
        'no-search',
        'medium',
        'Search runs on the database',
        'LIKE queries over millions of rows are slow and steal database capacity.',
      )
      ctx.recommend({
        id: 'add-search',
        title: 'Add a search engine',
        problem: 'Search has to be answered by the primary database.',
        why: 'Full-text search over a large catalog is slow and expensive in a transactional database.',
        suggestion: 'Index the catalog in a Search Engine, updated from change events.',
        severity: 'medium',
        improves: ['performance'],
      })
    }
  }
  if (p.auth) {
    if (caps.auth)
      ctx.strength(
        'auth',
        'Authentication is a dedicated component',
        'Identity is handled once instead of in every service.',
        ids(ofType(g, 'auth')),
      )
    else {
      ctx.score('maintainability', 'no-auth', -0.5, 'No visible place handles identity.')
      ctx.weakness(
        'no-auth',
        'medium',
        'No authentication component',
        'The challenge needs signed-in users, but nothing owns identity.',
      )
      ctx.recommend({
        id: 'add-auth',
        title: 'Add authentication',
        problem: 'Nothing owns sign-in and tokens.',
        why: 'Each service would otherwise implement identity checks its own way.',
        suggestion: 'Add an Authentication component and have the gateway validate tokens.',
        severity: 'medium',
        improves: ['maintainability', 'reliability'],
      })
    }
  }
  if (p.rateLimiting) {
    if (caps.rateLimiter) {
      ctx.score('reliability', 'rate-limiter', 0.7, 'Abusive or runaway clients are throttled.')
      ctx.strength(
        'rate-limiter',
        'Rate limiting protects the system',
        'Spikes from one client cannot starve the others.',
        ids(ofType(g, 'rateLimiter')),
      )
    } else {
      ctx.score('reliability', 'no-rate-limiter', -1, 'One client can overwhelm the system.')
      ctx.weakness(
        'no-rate-limiter',
        'medium',
        'No rate limiting',
        'A single misbehaving client or campaign can exhaust capacity or provider quotas.',
      )
      ctx.recommend({
        id: 'add-rate-limiter',
        title: 'Add a rate limiter',
        problem: 'Nothing caps how fast a client can send requests.',
        why: 'Abuse and bursts reach your services and third-party providers unchecked.',
        suggestion: 'Add a Rate Limiter at the entry point (or on the gateway).',
        severity: 'medium',
        improves: ['reliability'],
      })
    }
  }
  if (caps.observability === 0) {
    ctx.score('maintainability', 'no-observability', -1.5, 'Failures are invisible until users report them.')
    ctx.weakness(
      'no-observability',
      'medium',
      'No observability',
      'Without logs, metrics or traces you cannot see failures or find their cause.',
    )
    ctx.recommend({
      id: 'add-observability',
      title: 'Add logging and metrics',
      problem: 'The system has no logs, metrics or traces.',
      why: 'You cannot alert on errors or explain a slow request.',
      suggestion: 'Add Metrics for alerting and Logging (or Tracing) for diagnosis.',
      severity: 'low',
      improves: ['maintainability'],
    })
  } else {
    ctx.score(
      'maintainability',
      'observability',
      Math.min(1.5, 0.6 * caps.observability),
      'You can see what the system is doing.',
    )
    if (caps.observability >= 2)
      ctx.strength('observability', 'Observable system', 'Logs, metrics and traces make failures diagnosable.')
  }
  if (p.global && has(g, 'dns')) ctx.score('performance', 'dns', 0.3, 'DNS can route users to the nearest region.')
}

function ruleLatencyChain(ctx: Context) {
  const { g } = ctx
  const sync = (n: DesignNode) => !GROUPS.messaging.includes(n.type) && !GROUPS.observability.includes(n.type)
  let longest = 0
  const walk = (id: string, depth: number, seen: Set<string>) => {
    longest = Math.max(longest, depth)
    if (depth > 12) return
    for (const next of g.out.get(id) ?? []) {
      if (seen.has(next.id) || !sync(next)) continue
      seen.add(next.id)
      walk(next.id, depth + 1, seen)
      seen.delete(next.id)
    }
  }
  for (const entry of ofType(g, ...GROUPS.entry)) walk(entry.id, 0, new Set([entry.id]))
  if (longest >= 6) {
    ctx.score('performance', 'long-chain', -Math.min(2, (longest - 5) * 0.6), `Requests cross ${longest} synchronous hops.`)
    ctx.weakness(
      'long-chain',
      'medium',
      'Long synchronous call chain',
      `A request can pass through ${longest} components in sequence; each adds latency and a failure point.`,
    )
  }
}

function ruleSinglePointsOfFailure(ctx: Context) {
  const { g, p } = ctx
  const critical = g.nodes.filter(
    (n) => g.reachable.has(n.id) && n.type !== 'client' && !GROUPS.observability.includes(n.type) && !isRedundant(n),
  )
  for (const n of critical) {
    const isDb = n.type === 'sql' || n.type === 'nosql'
    ctx.spofs.push({
      id: `spof-${n.id}`,
      title: n.label,
      detail: isDb
        ? `Your database is currently a single point of failure. ${n.label} has no replica to fail over to.`
        : n.type === 'cache'
          ? `${n.label} has no replica; when it restarts, every read falls through to the database at once.`
          : `${n.label} runs a single instance; one crash or deploy takes it offline.`,
      severity: isDb || n.type === 'gateway' || n.type === 'loadBalancer' ? 'high' : 'medium',
      nodeIds: [n.id],
    })
  }
  if (critical.length) {
    ctx.score(
      'reliability',
      'spof',
      -Math.min(3, 0.9 * critical.length),
      `${critical.length} single point${critical.length === 1 ? '' : 's'} of failure on the request path.`,
    )
    const dbs = critical.filter((n) => n.type === 'sql' || n.type === 'nosql')
    if (dbs.length) {
      ctx.weakness('db-spof', 'high', 'Database is a single point of failure', `${names(dbs)} has no replication.`, ids(dbs))
      ctx.recommend({
        id: 'replicate-db',
        title: 'Introduce database replication',
        problem: `${names(dbs)} runs without a replica.`,
        why: 'When the only database node fails, every feature that touches data fails with it, and recovery means restoring from backup.',
        suggestion: 'Configure replicas (or multi-region replication) so a standby can take over.',
        severity: 'high',
        improves: ['reliability'],
      })
    }
  } else if (g.nodes.length > 2) {
    ctx.score('reliability', 'no-spof', 1, 'Every component on the request path has redundancy.')
    ctx.strength('no-spof', 'No single points of failure', 'Every component on the request path is redundant.')
  }

  const regional = g.nodes.filter((n) => n.config.regions !== undefined || n.config.replication === 'multi-region')
  const multiRegion =
    regional.some((n) => (n.config.regions ?? 1) > 1 && n.type !== 'cdn') ||
    g.nodes.some((n) => n.config.replication === 'multi-region')
  if ((p.global || p.scale === 3) && !multiRegion) {
    ctx.spofs.push({
      id: 'spof-region',
      title: 'Single region',
      detail: 'Everything runs in one region. A regional outage takes the whole system down.',
      severity: 'medium',
      nodeIds: [],
    })
    ctx.score('reliability', 'single-region', -0.5, 'All state lives in one region.')
  } else if (multiRegion) {
    ctx.tradeoff({
      id: 'multi-region',
      title: 'Multi-region',
      benefit: 'Survives a regional outage and serves users nearby.',
      cost: 'Replication lag, conflict handling and roughly double the infrastructure.',
    })
  }
}

function ruleCost(ctx: Context) {
  const { g, p } = ctx
  const costs = g.nodes.map((n) => ({ n, units: estimateNodeCost(n) })).sort((a, b) => b.units - a.units)
  const total = costs.reduce((s, c) => s + c.units, 0)
  const allowance = BUDGET_UNITS[p.budget] * (p.scale === 3 ? 1.5 : 1)
  const ratio = total / allowance
  ctx.score(
    'cost',
    'cost-total',
    -Math.min(9, ratio * 5),
    `Estimated ${Math.round(total)} cost units against a ${p.budget} budget (~${Math.round(allowance)} units).`,
  )
  const top = costs.slice(0, 2).filter((c) => c.units >= 6)
  if (top.length) ctx.score('cost', 'cost-drivers', 0, `Largest costs: ${top.map((c) => c.n.label).join(' and ')}.`)
  if (ratio > 1.1) {
    ctx.weakness(
      'over-budget',
      'medium',
      'Over budget',
      `This design costs roughly ${Math.round(ratio * 100)}% of what the budget allows.`,
      ids(top.map((c) => c.n)),
    )
  }
}

function ruleComplexity(ctx: Context) {
  const { g, caps } = ctx
  const counted = g.nodes.filter((n) => n.type !== 'client' && !GROUPS.observability.includes(n.type))
  const kinds = new Set(counted.map((n) => n.type)).size
  if (counted.length > 3)
    ctx.score(
      'complexity',
      'components',
      -Math.min(5, 0.3 * (counted.length - 3)),
      `${counted.length} components to deploy and operate.`,
    )
  if (kinds > 4)
    ctx.score('complexity', 'technologies', -Math.min(2, 0.25 * (kinds - 4)), `${kinds} different technologies to know.`)
  if (caps.messaging) ctx.score('complexity', 'messaging', -0.8, 'Asynchronous flows are harder to trace and test.')
  if (caps.services > 3)
    ctx.score(
      'complexity',
      'many-services',
      -Math.min(1.5, 0.3 * (caps.services - 3)),
      `${caps.services} services communicate over the network.`,
    )
  if (g.nodes.some((n) => n.config.replication === 'multi-region' || ((n.config.regions ?? 1) > 1 && n.type !== 'cdn'))) {
    ctx.score('complexity', 'multi-region', -0.7, 'Multi-region data needs replication and failover procedures.')
  }
}

/* ------------------------------------------------------------- assemble */

const WEIGHTS = (p: ChallengeProfile): Record<Dimension, number> => ({
  scalability: p.scale === 3 ? 1.4 : p.scale === 2 ? 1.15 : 1,
  reliability: p.strongConsistency ? 1.3 : 1.15,
  performance: p.media || p.realtime || p.readHeavy ? 1.25 : 1,
  cost: p.budget === 'lean' ? 1.2 : p.budget === 'generous' ? 0.6 : 0.85,
  complexity: 0.6,
  maintainability: 0.7,
})

const round1 = (v: number) => Math.round(v * 10) / 10
const clamp = (v: number) => Math.max(0, Math.min(10, v))
const SEVERITY_RANK: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 }
const bySeverity = <T extends { severity: InsightSeverity }>(a: T, b: T) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]

function describe(ctx: Context, scores: Record<Dimension, Score>): { summary: string; characteristics: string[] } {
  const { g, caps } = ctx
  const parts: string[] = []
  if (caps.cdn) parts.push('a CDN for content delivery')
  if (caps.gateway) parts.push('an API Gateway for service routing')
  if (caps.loadBalancer) parts.push('a load balancer to spread traffic')
  if (caps.services) parts.push(`${caps.services} ${caps.services === 1 ? 'service' : 'services'}`)
  if (caps.cache) parts.push(`${ofType(g, 'cache')[0]?.label ?? 'a cache'} for frequently accessed data`)
  const dbs = ofType(g, 'sql', 'nosql')
  if (dbs.length) {
    const rep = dbs.some((d) => d.config.replication === 'multi-region')
      ? ' with multi-region replication'
      : dbs.some((d) => d.config.replication === 'replicas')
        ? ' with replicas'
        : ''
    const kinds = [...new Set(dbs.map((d) => (d.type === 'sql' ? 'SQL' : 'NoSQL')))].join(' and ')
    parts.push(`${dbs.length === 1 ? 'a' : dbs.length} ${kinds} ${dbs.length === 1 ? 'database' : 'databases'}${rep}`)
  }
  if (caps.objectStorage) parts.push('object storage for large files')
  if (caps.search) parts.push('a search index')
  if (caps.messaging) parts.push('asynchronous processing through messaging')
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? 'a minimal set of components')
  const summary = `Your architecture uses ${list}.`

  const s = (d: Dimension) => scores[d].value
  const characteristics = [
    s('scalability') >= 7.5 ? 'Scalable' : s('scalability') >= 5 ? 'Moderately scalable' : 'Limited scalability',
    s('reliability') >= 7.5 ? 'Highly available' : s('reliability') >= 5 ? 'Moderately available' : 'Fragile under failure',
    caps.messaging || caps.cache || caps.nosql || caps.search ? 'Eventually consistent' : 'Strongly consistent',
    s('complexity') >= 7 ? 'Low complexity' : s('complexity') >= 4.5 ? 'Moderate complexity' : 'High complexity',
    s('cost') >= 7 ? 'Low cost' : s('cost') >= 4.5 ? 'Moderate cost' : 'High cost',
  ]
  return { summary, characteristics }
}

export function evaluateArchitecture(
  arch: Architecture,
  challenge: Challenge | undefined = getChallenge(arch.challengeId),
): ArchitectureEvaluation {
  if (!challenge) throw new Error(`Unknown challenge: ${arch.challengeId}`)
  const g = buildGraph(arch)
  const ctx = new Context(g, challenge, detectCapabilities(arch, g))

  rulePersistence(ctx)
  ruleCdn(ctx)
  ruleCache(ctx)
  ruleMessaging(ctx)
  ruleDatabase(ctx)
  ruleCompute(ctx)
  ruleGateway(ctx)
  ruleFeatures(ctx)
  ruleLatencyChain(ctx)
  ruleSinglePointsOfFailure(ctx)
  ruleCost(ctx)
  ruleComplexity(ctx)

  const scores = Object.fromEntries(
    DIMENSIONS.map((d) => {
      const factors = ctx.factors[d].length ? ctx.factors[d] : [{ rule: 'baseline', delta: 0, text: NEUTRAL[d] }]
      return [d, { value: round1(clamp(BASELINE[d] + factors.reduce((s, f) => s + f.delta, 0))), factors }]
    }),
  ) as Record<Dimension, Score>

  const w = WEIGHTS(challenge.profile)
  const totalWeight = DIMENSIONS.reduce((s, d) => s + w[d], 0)
  const overallScore = round1(DIMENSIONS.reduce((s, d) => s + w[d] * scores[d].value, 0) / totalWeight)

  return {
    challengeId: challenge.id,
    overallScore,
    scores,
    strengths: ctx.strengths,
    weaknesses: ctx.weaknesses.sort(bySeverity),
    bottlenecks: ctx.bottlenecks.sort(bySeverity),
    singlePointsOfFailure: ctx.spofs.sort(bySeverity),
    recommendations: ctx.recommendations.sort(bySeverity),
    tradeoffs: ctx.tradeoffs,
    ...describe(ctx, scores),
  }
}
