/**
 * Teaching content for the 10× Traffic Incident. Data only: the generic
 * reasoning code decides when to show it, and every number it mentions comes
 * from what the operator can see.
 */
import { ms, percent, usd } from '../format'
import type { ConsequenceContext, ScenarioGuide } from '../guide'

const pct = (ratio: number) => percent(ratio, 0)

export const trafficIncidentGuide: ScenarioGuide = {
  scenarioId: '10x-traffic-incident',
  facts: { databaseLoad: 'database-cpu', readShare: 'read-ratio', cacheableShare: 'cacheable-reads' },

  factGuides: {
    'database-cpu': {
      unknown: 'We don’t currently know how much database capacity is being consumed.',
      interpret: (value) =>
        value >= 1
          ? `The database is receiving more work than it can process (${pct(value)}). This makes database pressure a plausible contributor to the current latency and errors.`
          : value >= 0.85
            ? `The database is operating near its capacity (${pct(value)}). Latency rises steeply in this range, so it could be contributing to slow requests.`
            : `The database has headroom (${pct(value)}). On its own, it does not look like the bottleneck right now.`,
    },
    'database-latency': {
      unknown: 'We don’t know how long database queries take.',
      interpret: (value) => `Queries take ${ms(value)}. Application requests wait for their queries, so slow queries show up in p99.`,
    },
    'write-cost': {
      unknown: 'We don’t know how expensive writes are for the database.',
      interpret: (value) => `A write costs about ${Number(value.toFixed(1))}× a read. Caches and replicas only take reads off the primary database; every write still lands there.`,
    },
    'read-ratio': {
      unknown: 'We don’t know whether the surge is mostly people reading or writing.',
      interpret: (value) => `${pct(value)} of requests are reads. Reads can be served from a cache or a replica; writes always reach the primary database.`,
    },
    'cacheable-reads': {
      unknown: 'We don’t know how much of the read traffic a cache could answer.',
      interpret: (value) => `${pct(value)} of reads ask for the same popular data, so a warm cache could answer them without the database.`,
    },
  },

  decisions: {
    'investigate-traffic': {
      group: 'investigate',
      goal: 'Learn what the traffic is made of: how much is reads, and how much a cache could serve.',
    },
    'investigate-database': {
      group: 'investigate',
      goal: 'Learn how loaded PostgreSQL is, how slow its queries are, and what writes cost it.',
    },

    'scale-application': {
      group: 'capacity',
      goal: 'Increase application processing capacity.',
      helpsWhen: ['Application capacity is limiting request processing.'],
      mayNotHelpWhen: ['The database is already the bottleneck: more application capacity may simply send more pressure to the database.'],
      improves: [
        { label: 'Application CPU pressure', direction: 'down' },
        { label: 'Requests processed', direction: 'up' },
        { label: 'Latency', direction: 'down', when: 'if the application was the limit' },
      ],
      tradeoffs: ['Increases monthly cost', 'May shift the bottleneck elsewhere'],
      newRisk: 'More requests now reach whatever sits behind the application.',
      addresses: ['application'],
      consequence: (ctx) => {
        const lines: string[] = []
        const app = ctx.delta('appCpu')
        if (app?.better) lines.push(`Scaling increased how much traffic the application tier can process: application CPU ${ctx.show('appCpu')}.`)
        const db = ctx.delta('dbCpu')
        if (db && db.better === false && db.before !== null) lines.push(`${ctx.database} CPU ${ctx.show('dbCpu')}: the bottleneck has shifted toward the database, which now receives more pressure. Fixing one bottleneck can expose another.`)
        else if (ctx.databaseUnknown && !ctx.impactBetter) lines.push('Database load is unknown, so you can’t see where the extra work went.')
        if (!ctx.impactBetter) lines.push('Errors and latency did not improve, so the application was probably not the only limit.')
        return lines
      },
    },
    'add-database-replica': {
      group: 'capacity',
      goal: 'Add database read capacity with a second PostgreSQL server.',
      helpsWhen: ['Reads are contributing to database pressure.'],
      mayNotHelpWhen: ['Writes are the problem: every write still goes to the primary.'],
      improves: [
        { label: 'Reads on the primary', direction: 'down' },
        { label: 'Database utilization', direction: 'down', when: 'if reads are a large share of its load' },
        { label: 'Latency', direction: 'down', when: 'if database pressure is contributing' },
      ],
      tradeoffs: ['Increases monthly cost', 'Replica lag: reads can be slightly stale', 'One more database to run'],
      newRisk: 'Replica lag: some users can read data that is a moment out of date.',
      addresses: ['database'],
      consequence: (ctx) => {
        const lines = ['Half of the database reads now go to the replica. Writes still go to the primary.']
        const move = ctx.databaseMove()
        if (move) lines.push(move)
        return lines
      },
    },
    'upgrade-database': {
      group: 'capacity',
      goal: 'Increase database capacity by moving to a larger instance.',
      helpsWhen: ['Database capacity is genuinely the bottleneck.'],
      mayNotHelpWhen: ['The bottleneck is in front of the database: the application fails requests before they reach it.'],
      improves: [
        { label: 'Database utilization', direction: 'down', when: 'once the failover completes' },
        { label: 'Latency', direction: 'down', when: 'if database pressure is contributing' },
      ],
      tradeoffs: ['Doubles the database bill', 'A failover first: the database runs degraded for a few minutes'],
      newRisk: 'Things can get worse before they get better while the failover runs.',
      addresses: ['database'],
      consequence: (ctx) => (ctx.after.topology.rows.flat().some((node) => node.type === 'database' && node.health !== 'healthy') ? [`${ctx.database} is failing over and runs degraded until it completes, so things can get worse before they get better.`] : []),
    },
    'enable-rate-limiting': {
      group: 'protect',
      goal: 'Intentionally limit accepted traffic to protect system capacity.',
      helpsWhen: ['The system is overloaded, and serving some users well beats failing almost everyone.'],
      mayNotHelpWhen: ['The limit is above what the backend can actually handle.'],
      improves: [
        { label: 'Load behind the gateway', direction: 'down' },
        { label: 'Stability of accepted requests', direction: 'up' },
        { label: 'Throttled requests', direction: 'up' },
      ],
      tradeoffs: ['Sacrifices some traffic: rejected users count as unavailable', 'Real business requests are turned away'],
      newRisk: 'Rejected requests now count against availability on their own.',
      addresses: ['application', 'database', 'traffic'],
      consequence: rateLimitConsequence,
    },
    'tighten-rate-limit': {
      group: 'protect',
      goal: 'Admit less traffic through the gateway.',
      helpsWhen: ['The backend is still overloaded behind the current limit.'],
      improves: [
        { label: 'Load behind the gateway', direction: 'down' },
        { label: 'Throttled requests', direction: 'up' },
      ],
      tradeoffs: ['More users are rejected'],
      addresses: ['throttling'],
      consequence: rateLimitConsequence,
    },
    'relax-rate-limit': {
      group: 'protect',
      goal: 'Admit more traffic through the gateway.',
      helpsWhen: ['The backend has headroom behind the current limit.'],
      improves: [
        { label: 'Throttled requests', direction: 'down' },
        { label: 'Load behind the gateway', direction: 'up' },
      ],
      tradeoffs: ['The backend takes more load', 'Higher overload risk'],
      addresses: ['throttling'],
      consequence: rateLimitConsequence,
    },
    'enable-async-writes': {
      group: 'protect',
      goal: 'Move writes out of the synchronous request path.',
      helpsWhen: ['Writes are a meaningful part of the database’s load.'],
      mayNotHelpWhen: ['The database’s load is mostly reads: a queue only defers writes.'],
      improves: [
        { label: 'Immediate write pressure on the database', direction: 'down' },
        { label: 'Write delay', direction: 'up' },
      ],
      tradeoffs: ['Introduces delay: writes are applied later', 'Everything queued must still be processed', 'Users may not see their own changes right away'],
      newRisk: 'The queue can grow faster than it drains.',
      addresses: ['database'],
      consequence: (ctx) => {
        const lines = ['Writes now wait in a queue and reach the database later, at a steady rate. They still have to be processed.']
        const move = ctx.databaseMove()
        if (move) lines.push(move)
        return lines
      },
    },
    'enable-cache': {
      group: 'optimize',
      goal: 'Reduce database pressure by serving cacheable reads from Redis.',
      helpsWhen: ['Repeated reads create database pressure.'],
      mayNotHelpWhen: ['Little of the traffic is cacheable reads, or the bottleneck is elsewhere.'],
      improves: [
        { label: 'Database requests', direction: 'down' },
        { label: 'Database utilization', direction: 'down' },
        { label: 'Latency', direction: 'down', when: 'if database pressure is contributing' },
      ],
      tradeoffs: ['Needs a few minutes to warm up', 'Stale data and invalidation', 'More cost and one more system to run'],
      newRisk: 'Cache warm-up and invalidation now matter.',
      addresses: ['database'],
      consequence: (ctx) => {
        const lines: string[] = []
        const hit = ctx.value('cacheHit')
        if (hit !== null) lines.push(`More requests are now served from cache instead of reaching ${ctx.database}: Redis answers ${pct(hit)} of reads so far. It warms up over the next few minutes.`)
        const move = ctx.databaseMove()
        if (move) lines.push(move)
        return lines
      },
    },

    'scale-down-application': {
      group: 'cost',
      goal: 'Remove application instances to save money.',
      helpsWhen: ['The application has spare capacity and cost matters.'],
      improves: [{ label: 'Monthly cost', direction: 'down' }],
      tradeoffs: ['Less headroom if traffic rises again'],
      consequence: (ctx) => [savings(ctx), ctx.delta('appCpu') ? `Application CPU ${ctx.show('appCpu')}: fewer instances share the work.` : null].filter((line): line is string => line !== null),
    },
    'remove-database-replica': {
      group: 'cost',
      goal: 'Stop paying for the replica and send every read back to the primary.',
      helpsWhen: ['The primary can take the reads again.'],
      improves: [{ label: 'Monthly cost', direction: 'down' }],
      tradeoffs: ['The primary carries all reads again'],
      consequence: (ctx) => [savings(ctx), ctx.databaseMove()].filter((line): line is string => line !== null),
    },
    'downgrade-database': {
      group: 'cost',
      goal: 'Halve the database bill by failing back to the standard instance.',
      helpsWhen: ['The database has plenty of headroom and cost matters.'],
      improves: [{ label: 'Monthly cost', direction: 'down' }],
      tradeoffs: ['A failover first: degraded for a few minutes', 'Half the capacity afterwards'],
      consequence: (ctx) => [savings(ctx)].filter((line): line is string => line !== null),
    },
  },
}

function rateLimitConsequence(ctx: ConsequenceContext): string[] {
  const lines: string[] = []
  const throttled = ctx.value('throttled')
  if (throttled !== null) lines.push(`The gateway now turns away ${pct(throttled)} of requests. Those users count against availability, but everything behind the gateway gets less work.`)
  if (ctx.delta('appCpu')?.before != null) lines.push(`Application CPU ${ctx.show('appCpu')}.`)
  return lines
}

function savings(ctx: ConsequenceContext): string | null {
  const cost = ctx.delta('cost')
  return cost && cost.before !== null && cost.after !== null ? `You gave back ${usd(cost.before - cost.after)}/month.` : null
}
