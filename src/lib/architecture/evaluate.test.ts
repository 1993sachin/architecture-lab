import { describe, expect, it } from 'vitest'
import {
  CHALLENGES,
  compareEvaluations,
  decodeArchitecture,
  detectCapabilities,
  diffArchitectures,
  encodeArchitecture,
  evaluateArchitecture,
  exportArchitecture,
  importArchitecture,
  isEmptyDiff,
  validateArchitecture,
  type Architecture,
} from './index'
import { design } from './testing'

const ids = (items: Array<{ id: string }>) => items.map((i) => i.id)
const minimalVideo = () => design('video-platform').add('c', 'client').add('s', 'service').add('db', 'sql').link('c', 's', 'db')

describe('validation', () => {
  it('blocks an empty canvas and a design with no entry point', () => {
    expect(validateArchitecture({ challengeId: 'url-shortener', nodes: [], edges: [] }).canEvaluate).toBe(false)
    const noEntry = validateArchitecture(design('url-shortener').add('s', 'service').add('db', 'sql').link('s', 'db').build())
    expect(noEntry.canEvaluate).toBe(false)
    expect(noEntry.issues.find((i) => i.id === 'no-entry')?.message).toBe(
      'No client or gateway is present. Requests need somewhere to come from.',
    )
  })

  it('reports orphans, invalid flows and missing connections', () => {
    const arch = design('url-shortener')
      .add('c', 'client')
      .add('s', 'service', {}, 'Payment Service')
      .add('r', 'cache', {}, 'Redis Cache')
      .add('db', 'sql')
      .link('c', 's')
      .link('db', 'c')
      .build()
    const { issues, canEvaluate } = validateArchitecture(arch)
    const messages = issues.map((i) => i.message)
    expect(canEvaluate).toBe(true)
    expect(messages).toContain('Redis Cache is not connected to any service.')
    expect(messages).toContain('Payment Service is not connected to a database.')
    expect(messages.some((m) => m.startsWith('SQL Database cannot directly initiate a request to the client'))).toBe(true)
    expect(issues[0].severity).toBe('error')
  })

  it('flags a client talking to a database directly', () => {
    const { issues } = validateArchitecture(design('url-shortener').add('c', 'client').add('db', 'sql').link('c', 'db').build())
    expect(issues.some((i) => i.id.startsWith('client-to-data') && i.severity === 'error')).toBe(true)
  })

  it('checks challenge dependencies by service name', () => {
    const arch = design('ecommerce')
      .add('c', 'client')
      .add('ch', 'service', { instances: 2 }, 'Checkout Service')
      .add('db', 'sql')
      .link('c', 'ch', 'db')
      .build()
    expect(validateArchitecture(arch).issues.map((i) => i.message)).toContain('Checkout Service requires Payment Service.')
    const fixed = design('ecommerce')
      .add('c', 'client')
      .add('ch', 'service', {}, 'Checkout Service')
      .add('p', 'service', {}, 'Payment Service')
      .add('i', 'service', {}, 'Inventory Service')
      .add('db', 'sql')
      .link('c', 'ch', 'p', 'db')
      .link('ch', 'i', 'db')
      .build()
    expect(validateArchitecture(fixed).issues.some((i) => i.id.startsWith('dep-'))).toBe(false)
  })

  it('warns about a queue without a consumer', () => {
    const arch = design('notification-platform')
      .add('c', 'client')
      .add('s', 'service')
      .add('q', 'queue')
      .link('c', 's', 'q')
      .build()
    expect(validateArchitecture(arch).issues.some((i) => i.id === 'no-consumer-q')).toBe(true)
  })
})

describe('component detection', () => {
  it('counts only connected, reachable components', () => {
    const arch = design('video-platform')
      .add('c', 'client')
      .add('cdn', 'cdn')
      .add('os', 'objectStorage')
      .add('r', 'cache') // placed but never connected
      .add('s', 'service')
      .add('q', 'queue')
      .add('w', 'worker')
      .add('db', 'sql')
      .link('c', 'cdn', 'os')
      .link('c', 's', 'db')
      .link('s', 'q', 'w', 'db')
      .build()
    const caps = detectCapabilities(arch)
    expect(caps).toMatchObject({ cdn: true, objectStorage: true, cache: false, messaging: true, sql: true, persistence: true })
    expect(caps.services).toBe(2)
  })

  it('does not count a queue nobody consumes as async processing', () => {
    const arch = design('notification-platform')
      .add('c', 'client')
      .add('s', 'service')
      .add('q', 'queue')
      .link('c', 's', 'q')
      .build()
    expect(detectCapabilities(arch).messaging).toBe(false)
  })
})

describe('single points of failure', () => {
  it('detects a single database and a single service instance', () => {
    const e = evaluateArchitecture(
      design('url-shortener').add('c', 'client').add('s', 'service').add('db', 'sql').link('c', 's', 'db').build(),
    )
    expect(ids(e.singlePointsOfFailure)).toEqual(expect.arrayContaining(['spof-db', 'spof-s']))
    expect(e.singlePointsOfFailure.find((x) => x.id === 'spof-db')!.detail).toContain(
      'Your database is currently a single point of failure',
    )
    expect(e.bottlenecks.some((b) => b.detail.includes('limited horizontal scalability'))).toBe(true)
  })

  it('clears once components are redundant', () => {
    const e = evaluateArchitecture(
      design('url-shortener')
        .add('c', 'client')
        .add('lb', 'loadBalancer')
        .add('s', 'service', { instances: 3 })
        .add('db', 'sql', { replication: 'replicas' })
        .link('c', 'lb', 's', 'db')
        .build(),
    )
    expect(e.singlePointsOfFailure).toHaveLength(0)
    expect(ids(e.strengths)).toContain('no-spof')
  })

  it('flags a single region for global challenges', () => {
    const e = evaluateArchitecture(minimalVideo().build())
    expect(ids(e.singlePointsOfFailure)).toContain('spof-region')
  })
})

describe('CDN rules', () => {
  it('warns strongly about global video without a CDN', () => {
    const e = evaluateArchitecture(minimalVideo().add('os', 'objectStorage').link('s', 'os').build())
    const w = e.weaknesses.find((x) => x.id === 'no-cdn')!
    expect(w.severity).toBe('high')
    expect(w.detail).toBe('Global video delivery without a CDN will create unnecessary origin traffic and increase latency.')
    expect(e.recommendations.find((r) => r.id === 'add-cdn')!.problem).toBe(
      'Your architecture serves video directly from object storage.',
    )
  })

  it('rewards a CDN for video and records the trade-off', () => {
    const base = minimalVideo().add('os', 'objectStorage').link('s', 'os')
    const without = evaluateArchitecture(base.build())
    const withCdn = evaluateArchitecture(base.add('cdn', 'cdn').link('c', 'cdn', 'os').build())
    expect(withCdn.scores.performance.value).toBeGreaterThan(without.scores.performance.value)
    expect(withCdn.scores.scalability.value).toBeGreaterThan(without.scores.scalability.value)
    expect(ids(withCdn.strengths)).toContain('cdn')
    expect(withCdn.tradeoffs.find((t) => t.id === 'cdn')!.benefit).toBe('Lower latency and reduced origin load.')
  })

  it('treats a CDN as mild extra cost where nothing is cacheable', () => {
    const base = design('notification-platform').add('c', 'client').add('s', 'service').add('db', 'nosql').link('c', 's', 'db')
    const withCdn = evaluateArchitecture(base.add('cdn', 'cdn').link('c', 'cdn', 's').build())
    expect(withCdn.scores.cost.factors.some((f) => f.rule === 'cdn-unneeded')).toBe(true)
  })
})

describe('cache rules', () => {
  const shortener = () =>
    design('url-shortener').add('c', 'client').add('s', 'service', { instances: 2 }).add('db', 'nosql').link('c', 's', 'db')

  it('improves read-heavy performance and removes the read bottleneck', () => {
    const without = evaluateArchitecture(shortener().build())
    const withCache = evaluateArchitecture(shortener().add('r', 'cache').link('s', 'r').build())
    expect(withCache.scores.performance.value).toBeGreaterThan(without.scores.performance.value)
    expect(ids(without.weaknesses)).toContain('no-cache')
    expect(ids(without.bottlenecks)).toContain('db-reads')
    expect(ids(withCache.bottlenecks)).not.toContain('db-reads')
  })

  it('adds a stale-data trade-off when consistency matters', () => {
    const e = evaluateArchitecture(
      design('ecommerce')
        .add('c', 'client')
        .add('s', 'service')
        .add('r', 'cache', { ttl: 3600 })
        .add('db', 'sql')
        .link('c', 's', 'db')
        .link('s', 'r')
        .build(),
    )
    expect(e.tradeoffs.find((t) => t.id === 'cache')!.context).toContain('may serve stale data')
    expect(ids(e.weaknesses)).toContain('cache-ttl')
  })
})

describe('queue rules', () => {
  const api = () =>
    design('notification-platform')
      .add('c', 'client')
      .add('s', 'service', { instances: 2 })
      .add('db', 'nosql')
      .link('c', 's', 'db')

  it('rewards async processing where work is slow, at a complexity cost', () => {
    const sync = evaluateArchitecture(api().build())
    const queued = evaluateArchitecture(
      api().add('q', 'queue').add('w', 'worker', { instances: 2 }).link('s', 'q', 'w', 'db').build(),
    )
    expect(queued.scores.reliability.value).toBeGreaterThan(sync.scores.reliability.value)
    expect(queued.scores.scalability.value).toBeGreaterThan(sync.scores.scalability.value)
    expect(queued.scores.complexity.value).toBeLessThan(sync.scores.complexity.value)
    expect(queued.tradeoffs.find((t) => t.id === 'queue')!.context).toBe(
      'The message queue decouples producers and consumers, but introduces eventual consistency.',
    )
    expect(ids(sync.recommendations)).toContain('add-queue')
  })

  it('counts a queue as complexity without benefit where nothing is asynchronous', () => {
    const e = evaluateArchitecture(
      design('url-shortener')
        .add('c', 'client')
        .add('s', 'service')
        .add('q', 'queue')
        .add('w', 'worker')
        .add('db', 'sql')
        .link('c', 's', 'q', 'w', 'db')
        .build(),
    )
    expect(e.scores.complexity.factors.some((f) => f.rule === 'async-unneeded')).toBe(true)
  })
})

describe('database rules', () => {
  it('prefers SQL for transactional checkout without assuming NoSQL is better', () => {
    const shop = (db: 'sql' | 'nosql') =>
      evaluateArchitecture(
        design('ecommerce')
          .add('c', 'client')
          .add('s', 'service', { instances: 2 })
          .add('db', db, { replication: 'replicas' })
          .link('c', 's', 'db')
          .build(),
      )
    expect(shop('sql').scores.reliability.value).toBeGreaterThan(shop('nosql').scores.reliability.value)
    expect(ids(shop('nosql').weaknesses)).toContain('nosql-transactions')
  })

  it('favours a partitioned store for write-heavy scale', () => {
    const chat = (db: 'sql' | 'nosql') =>
      evaluateArchitecture(
        design('realtime-chat')
          .add('c', 'client')
          .add('s', 'service', { instances: 3 })
          .add('db', db, { replication: 'replicas' })
          .link('c', 's', 'db')
          .build(),
      )
    expect(chat('nosql').scores.scalability.value).toBeGreaterThan(chat('sql').scores.scalability.value)
    expect(ids(chat('sql').bottlenecks)).toContain('sql-writes')
  })

  it('detects a database shared by many services as a bottleneck', () => {
    const e = evaluateArchitecture(
      design('ecommerce')
        .add('c', 'client')
        .add('g', 'gateway')
        .add('a', 'service', {}, 'Catalog Service')
        .add('b', 'service', {}, 'Cart Service')
        .add('o', 'service', {}, 'Order Service')
        .add('db', 'sql')
        .link('c', 'g')
        .link('g', 'a', 'db')
        .link('g', 'b', 'db')
        .link('g', 'o', 'db')
        .build(),
    )
    expect(e.bottlenecks.find((b) => b.id === 'shared-db-db')!.detail).toContain('throughput bottleneck')
  })

  it('rewards replication', () => {
    const shortener = (replication: 'none' | 'replicas') =>
      evaluateArchitecture(
        design('url-shortener')
          .add('c', 'client')
          .add('s', 'service', { instances: 2 })
          .add('db', 'sql', { replication })
          .link('c', 's', 'db')
          .build(),
      )
    expect(shortener('replicas').scores.reliability.value).toBeGreaterThan(shortener('none').scores.reliability.value)
  })
})

describe('scoring', () => {
  it('keeps every score within 0–10 and explains it', () => {
    for (const c of CHALLENGES) {
      const e = evaluateArchitecture(
        design(c.id).add('c', 'client').add('s', 'service').add('db', 'sql').link('c', 's', 'db').build(),
      )
      for (const s of Object.values(e.scores)) {
        expect(s.value).toBeGreaterThanOrEqual(0)
        expect(s.value).toBeLessThanOrEqual(10)
        expect(s.factors.length).toBeGreaterThan(0)
      }
      expect(e.overallScore).toBeGreaterThanOrEqual(0)
      expect(e.overallScore).toBeLessThanOrEqual(10)
    }
  })

  it('scores a considered design above a minimal one', () => {
    const minimal = evaluateArchitecture(minimalVideo().build())
    const considered = evaluateArchitecture(
      design('video-platform')
        .add('c', 'client')
        .add('cdn', 'cdn')
        .add('os', 'objectStorage')
        .add('g', 'gateway')
        .add('a', 'auth')
        .add('cat', 'service', { instances: 2, autoscaling: true }, 'Catalog Service')
        .add('v', 'service', { instances: 2 }, 'Video Service')
        .add('r', 'cache', { replication: 'replicas' })
        .add('db', 'sql', { replication: 'replicas' })
        .add('q', 'queue')
        .add('w', 'worker', { instances: 2 }, 'Transcoding Worker')
        .add('st', 'stream')
        .add('se', 'search')
        .add('m', 'metrics')
        .link('c', 'cdn', 'os')
        .link('c', 'g', 'cat', 'db')
        .link('g', 'a')
        .link('g', 'v', 'q', 'w', 'os')
        .link('cat', 'r')
        .link('cat', 'se')
        .link('v', 'st', 'w')
        .build(),
    )
    expect(considered.overallScore).toBeGreaterThan(minimal.overallScore + 3)
    // More infrastructure is not free: the simpler design wins on cost and complexity.
    expect(minimal.scores.cost.value).toBeGreaterThan(considered.scores.cost.value)
    expect(minimal.scores.complexity.value).toBeGreaterThan(considered.scores.complexity.value)
  })

  it('is deterministic', () => {
    const arch = minimalVideo().build()
    expect(evaluateArchitecture(arch)).toEqual(evaluateArchitecture(arch))
  })

  it('summarizes the design in words', () => {
    const e = evaluateArchitecture(minimalVideo().add('cdn', 'cdn').add('os', 'objectStorage').link('c', 'cdn', 'os').build())
    expect(e.summary).toMatch(/^Your architecture uses a CDN for content delivery/)
    expect(e.characteristics).toHaveLength(5)
  })
})

describe('recommendations', () => {
  it('explain problem, why and suggestion, most severe first', () => {
    const e = evaluateArchitecture(minimalVideo().build())
    expect(e.recommendations.length).toBeGreaterThan(3)
    for (const r of e.recommendations) {
      expect(r.problem && r.why && r.suggestion).toBeTruthy()
    }
    expect(e.recommendations[0].severity).toBe('high')
    expect(ids(e.recommendations)).toEqual(expect.arrayContaining(['add-cdn', 'add-object-storage', 'replicate-db']))
  })

  it('disappear once addressed', () => {
    const e = evaluateArchitecture(
      design('url-shortener')
        .add('c', 'client')
        .add('s', 'service', { instances: 2 })
        .add('db', 'sql', { replication: 'replicas' })
        .link('c', 's', 'db')
        .build(),
    )
    expect(ids(e.recommendations)).not.toContain('replicate-db')
    expect(ids(e.recommendations)).not.toContain('scale-services')
  })
})

describe('serialization', () => {
  const arch: Architecture = design('video-platform')
    .add('c', 'client')
    .add('s', 'service', { instances: 3, autoscaling: true }, 'Catalog Service')
    .add('db', 'sql', { replication: 'multi-region' })
    .link('c', 's', 'db')
    .build()

  it('round-trips through a URL-safe string', () => {
    const encoded = encodeArchitecture(arch)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeArchitecture(encoded)).toEqual(arch)
  })

  it('handles non-ASCII labels', () => {
    const named = { ...arch, nodes: arch.nodes.map((n) => (n.id === 's' ? { ...n, label: 'Katalog – Café' } : n)) }
    expect(decodeArchitecture(encodeArchitecture(named))!.nodes[1].label).toBe('Katalog – Café')
  })

  it('rejects malformed or unknown input', () => {
    expect(decodeArchitecture('not-base64!!')).toBeNull()
    expect(decodeArchitecture(btoa(JSON.stringify({ v: 1, c: 'nope', n: [], e: [] })))).toBeNull()
    const sneaky = btoa(
      JSON.stringify({
        v: 1,
        c: 'url-shortener',
        n: [
          ['a', 'mainframe', 0, 0, 0],
          ['b', 'sql', 0, 0, 0, { replication: 'quantum' }],
        ],
        e: [
          [0, 1],
          [1, 1],
        ],
      }),
    )
    const decoded = decodeArchitecture(sneaky)!
    expect(decoded.nodes.map((n) => n.type)).toEqual(['sql'])
    expect(decoded.nodes[0].config.replication).toBe('none')
    expect(decoded.edges).toEqual([])
  })

  it('exports and re-imports JSON with the evaluation', () => {
    const evaluation = evaluateArchitecture(arch)
    const exported = exportArchitecture(arch, evaluation, new Date('2026-01-01T00:00:00Z'))
    expect(exported.challenge.title).toBe('Video Learning Platform')
    expect(exported.evaluation?.overallScore).toBe(evaluation.overallScore)
    expect(importArchitecture(JSON.stringify(exported))).toEqual(arch)
    expect(importArchitecture('{"format":"other"}')).toBeNull()
    expect(importArchitecture('nope')).toBeNull()
  })
})

describe('before/after comparison', () => {
  it('diffs components, connections and configuration', () => {
    const before = design('ecommerce')
      .add('c', 'client')
      .add('o', 'service', {}, 'Order Service')
      .add('i', 'service', {}, 'Inventory Service')
      .link('c', 'o', 'i')
      .build()
    const after = design('ecommerce')
      .add('c', 'client')
      .add('o', 'service', { instances: 3 }, 'Order Service')
      .add('i', 'service', {}, 'Inventory Service')
      .add('q', 'queue')
      .link('c', 'o', 'q', 'i')
      .build()
    const d = diffArchitectures(before, after)
    expect(d.added.map((n) => n.label)).toEqual(['Message Queue'])
    expect(d.connectionsRemoved).toEqual(['Order Service → Inventory Service'])
    expect(d.connectionsAdded).toEqual(['Order Service → Message Queue', 'Message Queue → Inventory Service'])
    expect(d.configChanged[0].changes).toEqual(['instances 1 → 3'])
    expect(isEmptyDiff(diffArchitectures(before, before))).toBe(true)
  })

  it('explains score movements by the rules behind them', () => {
    const before = minimalVideo().add('os', 'objectStorage').link('s', 'os').build()
    const after = minimalVideo().add('os', 'objectStorage').add('cdn', 'cdn').link('s', 'os').link('c', 'cdn', 'os').build()
    const cmp = compareEvaluations(evaluateArchitecture(before), evaluateArchitecture(after), diffArchitectures(before, after))
    const perf = cmp.dimensions.find((d) => d.dimension === 'performance')!
    expect(perf.after).toBeGreaterThan(perf.before)
    expect(cmp.explanations[0]).toMatch(/^Adding CDN improved/)
    expect(cmp.explanations.some((e) => e.startsWith('Performance +'))).toBe(true)
    expect(cmp.overall.delta).toBeGreaterThan(0)
  })
})
