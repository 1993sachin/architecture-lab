import type { Mechanism } from '@/lib/simulation/resilience'

export interface MechanismTradeoff {
  id: Mechanism
  title: string
  benefit: string
  cost: string
}

export const MECHANISMS: MechanismTradeoff[] = [
  {
    id: 'retry',
    title: 'Retry',
    benefit: 'Improves resilience against transient failures.',
    cost: 'Can increase latency and amplify traffic.',
  },
  {
    id: 'circuitBreaker',
    title: 'Circuit Breaker',
    benefit: 'Prevents cascading failures.',
    cost: 'Some requests fail fast while the dependency is unhealthy.',
  },
  {
    id: 'cache',
    title: 'Cache',
    benefit: 'Lower latency and reduced backend load.',
    cost: 'Potential stale data and cache invalidation complexity.',
  },
  {
    id: 'queue',
    title: 'Message Queue',
    benefit: 'Decouples services and enables asynchronous processing.',
    cost: 'Introduces eventual consistency and operational complexity.',
  },
]

export const LESSONS: Array<{ title: string; body: string }> = [
  {
    title: 'Retry',
    body: 'Try a failed call again. Great for blips, harmful when the dependency is truly down: every retry is more load.',
  },
  { title: 'Timeout', body: 'Decide how long to wait. Without one, a slow dependency holds every caller hostage.' },
  {
    title: 'Circuit Breaker',
    body: 'Stop calling a failing dependency for a while, then test it with one request before trusting it again.',
  },
  { title: 'Caching', body: 'Answer repeat reads from memory. Faster and lighter, but the answer can be stale.' },
  {
    title: 'Asynchronous Processing',
    body: 'Accept work now and do it later through a queue, so a slow or broken consumer does not block the user.',
  },
  {
    title: 'Partial Failure',
    body: 'In a distributed system some parts fail while others work. Design for it instead of all-or-nothing.',
  },
  {
    title: 'Cascading Failure',
    body: 'One failing component drags down the ones that depend on it, like the Payment Database taking out checkout.',
  },
  {
    title: 'Graceful Degradation',
    body: 'Keep the core experience working with less: cached stock, queued orders, a clear error instead of a hang.',
  },
]
