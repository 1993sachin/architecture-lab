/**
 * Engineering concepts, in plain English, for someone who knows how to build
 * software but has never been on call.
 *
 * Scenario-independent: nothing here names a component, a decision or a
 * number from any incident. Live values come in only through `example`, which
 * the UI calls with what the operator can currently see.
 */
import { metricValue, ms, percent } from '@/lib/incident/format'

export type ConceptId =
  | 'rps'
  | 'latency'
  | 'p95'
  | 'p99'
  | 'error-rate'
  | 'availability'
  | 'throttling'
  | 'cpu'
  | 'memory'
  | 'cache-hit-rate'
  | 'queue-depth'
  | 'slo'
  | 'monthly-cost'
  | 'impact'
  | 'complexity'
  | 'bottleneck'

/** A small flow diagram: each step leads to the next. */
export interface Flow {
  title: string
  steps: string[]
}

export interface EngineeringConcept {
  id: ConceptId
  title: string
  /** One line: what it is. Used for tooltips. */
  short: string
  /** A plain-English definition, two or three sentences at most. */
  what: string
  /** A worked example, using the live value when there is one. */
  example?: (value: number) => string[]
  /** The value the example uses when nothing is observed. */
  sample?: number
  whyItMatters: string
  /** What can push it up or down. Possibilities, never a diagnosis. */
  affectedBy?: string[]
  /** Ways engineers tend to improve it. */
  improvedBy?: string[]
  /** The one thing people most often get wrong about it. */
  caveat?: string
  flows?: Flow[]
  related?: ConceptId[]
}

const outOf100 = (ratio: number) => Math.round(ratio * 100)

export const CONCEPTS: Record<ConceptId, EngineeringConcept> = {
  rps: {
    id: 'rps',
    title: 'Requests per second (RPS)',
    short: 'How many requests arrive every second.',
    what: 'Every page load, API call or form submit is a request. RPS counts how many arrive each second.',
    example: (value) => [`Traffic = ${metricValue('rps', value)}`, `About ${Math.round(value).toLocaleString('en-US')} requests arrive every second.`],
    sample: 10000,
    whyItMatters: 'Each request is work for every component it passes through. More requests means more work, whether or not you have the capacity for it.',
    affectedBy: ['Launches, marketing and viral moments', 'Time of day', 'Retries: failing requests that clients send again'],
    related: ['cpu', 'bottleneck'],
  },
  latency: {
    id: 'latency',
    title: 'Latency',
    short: 'How long a request takes, from arriving to answered.',
    what: 'Latency is the time between a request arriving and its response going back. It includes waiting in line, not just doing the work.',
    whyItMatters: 'Slow responses feel broken to users, and slow requests hold resources (threads, connections) longer, which slows everyone else down.',
    affectedBy: ['A component close to its capacity, so requests wait', 'Slow database queries', 'Slow downstream services', 'Network delays'],
    related: ['p95', 'p99', 'bottleneck'],
  },
  p95: {
    id: 'p95',
    title: 'p95 latency',
    short: '95% of requests complete within this time.',
    what: 'Sort every request by how long it took. p95 is the time the fastest 95% finish within; the slowest 5% take longer.',
    example: (value) => [`p95 = ${ms(value)}`, `95 out of 100 requests finish within ${ms(value)}.`],
    sample: 250,
    whyItMatters: 'Averages hide slow requests. p95 shows what a noticeable minority of users experience.',
    related: ['p99', 'latency'],
  },
  p99: {
    id: 'p99',
    title: 'p99 latency',
    short: '99% of requests complete within this time.',
    what: 'Sort every request by how long it took. p99 is the time the fastest 99% finish within; only the slowest 1% take longer.',
    example: (value) => [`p99 = ${ms(value)}`, `99 out of 100 requests finish within ${ms(value)}.`, 'The slowest 1 in 100 takes longer than that.'],
    sample: 3800,
    whyItMatters: 'Averages can hide slow requests. p99 shows how bad the experience is for the slowest 1% of users, and it is usually the first number to move when something is struggling.',
    affectedBy: [
      'Overloaded application servers',
      'An overloaded database',
      'Slow downstream dependencies',
      'Queues and backlogs',
      'Network delays',
      'Resource contention',
    ],
    caveat: 'p99 tells you that something is slow, not what. You need other evidence to find out which component is responsible.',
    related: ['latency', 'p95', 'bottleneck', 'slo'],
  },
  'error-rate': {
    id: 'error-rate',
    title: 'Error rate',
    short: 'The share of requests that fail with a server error.',
    what: 'The percentage of requests the system tried to handle but could not, for example because a component was out of capacity or timed out.',
    example: (value) => [`Error rate = ${percent(value)}`, `About ${(value * 1000).toFixed(value * 1000 < 10 ? 1 : 0)} in every 1,000 requests fail.`],
    sample: 0.02,
    whyItMatters: 'Every failed request is a user who got an error page. Failures also count directly against availability.',
    affectedBy: ['A component past its capacity', 'Timeouts while waiting on something slow', 'A failover or outage'],
    related: ['availability', 'bottleneck'],
  },
  availability: {
    id: 'availability',
    title: 'Availability',
    short: 'How often requests succeed instead of failing.',
    what: 'Availability is the share of requests that complete successfully. Requests that fail, and requests you deliberately turn away, both count against it.',
    example: (value) => [`Availability = ${percent(value)}`, `Approximately ${outOf100(value)} out of 100 requests succeed.`],
    sample: 0.99,
    whyItMatters: 'It is the most direct measure of whether users are being served. Small-looking drops matter: 98% means 1 request in 50 fails.',
    improvedBy: [
      'Removing a bottleneck',
      'Adding capacity',
      'Reducing expensive work',
      'Protecting the system from overload',
      'Caching expensive reads',
      'Queueing work when appropriate',
    ],
    caveat: 'There is no universal “increase availability” button. You need to understand why requests are failing first.',
    flows: [{ title: 'How it connects', steps: ['Traffic', 'Capacity', 'Bottleneck', 'Latency / errors', 'Successful requests', 'Availability'] }],
    related: ['error-rate', 'throttling', 'slo', 'bottleneck'],
  },
  throttling: {
    id: 'throttling',
    title: 'Throttling (rate limiting)',
    short: 'Deliberately rejecting some traffic to protect the system.',
    what: 'Throttling limits how much traffic the system accepts. Requests above the limit are rejected immediately instead of being let in. For example, 100K rps may arrive while the system admits only 30K rps.',
    example: (value) => [`Throttled = ${percent(value)}`, `About ${outOf100(value) || '<1'} in 100 requests are turned away on purpose.`],
    sample: 0.1,
    whyItMatters: 'A system pushed far past its capacity can fail almost every request. Rejecting some traffic keeps the rest within what the system can handle.',
    flows: [
      { title: 'Without protection', steps: ['Too much traffic', 'Resources exhausted', 'Latency explodes', 'Errors increase', 'Almost everyone suffers'] },
      { title: 'With throttling', steps: ['Too much traffic', 'Reject some traffic', 'Protect system capacity', 'More accepted requests succeed'] },
      { title: 'More throttling', steps: ['Lower accepted traffic', 'Potentially better system health'] },
      { title: 'Less throttling', steps: ['More traffic admitted', 'Potentially higher overload risk'] },
    ],
    caveat: 'Throttling is a protection with a business cost, not a fix. Every rejected request is a real user who was not served, and it counts against availability.',
    related: ['availability', 'rps'],
  },
  cpu: {
    id: 'cpu',
    title: 'CPU utilization',
    short: 'How much of a component’s processing capacity is in use.',
    what: 'The share of a component’s processing capacity being used right now. 100% means it is doing all the work it can; above 100% means work arrives faster than it can be done.',
    example: (value) => [`Utilization = ${percent(value, 0)}`, value >= 1 ? `It is receiving ${percent(value, 0)} of the work it can handle.` : `It is using ${percent(value, 0)} of its capacity, with ${percent(1 - value, 0)} to spare.`],
    sample: 0.6,
    whyItMatters: 'Latency rises steeply as utilization approaches 100%, because requests start waiting for each other. Past 100%, requests queue up and start failing.',
    affectedBy: ['Traffic', 'How expensive each request is', 'How many instances share the work'],
    caveat: 'Low utilization does not always mean healthy: a component can look idle because something in front of it is failing requests before they arrive.',
    related: ['bottleneck', 'latency'],
  },
  memory: {
    id: 'memory',
    title: 'Memory utilization',
    short: 'How much of a component’s memory is in use.',
    what: 'The share of available memory a process or machine is using. Unlike CPU, running out of memory tends to fail abruptly: processes are killed or start swapping to disk.',
    whyItMatters: 'Memory that keeps climbing can mean a leak or an unbounded cache or queue. Close to the limit, a small spike can crash a process.',
    affectedBy: ['Caches and buffers', 'Large or many concurrent requests', 'Leaks'],
    related: ['cpu'],
  },
  'cache-hit-rate': {
    id: 'cache-hit-rate',
    title: 'Cache hit rate',
    short: 'The share of reads answered from the cache.',
    what: 'A cache keeps copies of recently read data in fast memory. A hit is a read the cache can answer; a miss has to go to the database.',
    example: (value) => [`Hit rate = ${percent(value, 0)}`, `${outOf100(value)} out of 100 reads are answered by the cache; ${100 - outOf100(value)} still reach the database.`],
    sample: 0.7,
    whyItMatters: 'Every hit is a query the database does not have to run. A low hit rate means more requests reach the database instead of being served from cache.',
    affectedBy: ['How repetitive the reads are', 'How long the cache has been running (a new cache starts cold)', 'How much data fits in it'],
    caveat: 'Caches only help with reads, and only with data that can be a little stale.',
    related: ['bottleneck'],
  },
  'queue-depth': {
    id: 'queue-depth',
    title: 'Queue depth',
    short: 'How much work is waiting to be processed.',
    what: 'A queue lets a system accept work now and process it later. Queue depth is how many items are waiting.',
    example: (value) => [`Queue depth = ${metricValue('messages', value)}`, `${Math.round(value).toLocaleString('en-US')} items are waiting to be processed.`],
    sample: 1200,
    whyItMatters: 'A steady or shrinking queue is fine. A growing one means work is arriving faster than it is processed: users wait longer and, eventually, the queue runs out of room.',
    caveat: 'A queue moves work out of the way; it does not make it disappear. Everything in it still has to be processed.',
    related: ['latency'],
  },
  slo: {
    id: 'slo',
    title: 'SLO (service level objective)',
    short: 'A target the service promises to meet.',
    what: 'An SLO is a measurable promise, such as “99% of requests succeed” or “p99 stays under 500 ms”. Breaching it is what turns a bad minute into an incident.',
    whyItMatters: 'SLOs say which numbers matter and how good is good enough, so the team knows when to act and when to leave things alone.',
    related: ['availability', 'p99'],
  },
  'monthly-cost': {
    id: 'monthly-cost',
    title: 'Monthly cost',
    short: 'What the running system costs per month.',
    what: 'Everything you run (instances, databases, caches) is billed by the hour. This is that bill projected over a month.',
    whyItMatters: 'Capacity is not free. Most fixes cost money, and the budget can change during an incident. Spending money you did not need is a real cost too.',
    related: ['complexity'],
  },
  impact: {
    id: 'impact',
    title: 'Incident impact',
    short: 'What users actually experience.',
    what: 'The numbers users feel directly: how slow responses are, how many fail, and how many are turned away. CPU and cache numbers explain impact; they are not impact themselves.',
    whyItMatters: 'Impact is what the incident is about. Every decision should eventually show up here, for better or worse.',
    related: ['availability', 'p99', 'error-rate', 'throttling'],
  },
  complexity: {
    id: 'complexity',
    title: 'Complexity',
    short: 'How much the team has to run and understand.',
    what: 'Every new component (a cache, a replica, a queue) is another thing to monitor, debug and keep consistent. Complexity is a rough score of that burden.',
    whyItMatters: 'A system that is too complex for the team to operate fails in new and confusing ways. Some fixes trade a problem today for complexity forever.',
    related: ['monthly-cost'],
  },
  bottleneck: {
    id: 'bottleneck',
    title: 'Bottleneck',
    short: 'The component that limits the whole system.',
    what: 'A request passes through several components. The one with the least spare capacity limits how much the whole path can handle. Adding capacity anywhere else does not help.',
    whyItMatters: 'Fixing the wrong component costs time and money without helping, and fixing the right one can move the bottleneck somewhere else.',
    flows: [{ title: 'How load turns into failures', steps: ['Traffic ↑', 'Load on a component ↑', 'Component reaches capacity', 'Requests wait, latency ↑', 'Requests fail', 'Availability ↓'] }],
    related: ['cpu', 'latency'],
  },
}

export function concept(id: ConceptId): EngineeringConcept {
  return CONCEPTS[id]
}
