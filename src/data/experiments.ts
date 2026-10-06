import { Boxes, ShieldAlert, Workflow } from 'lucide-react'
import type { ExperimentMeta } from '@/types/experiment'

/**
 * Registry of experiments. The landing page, the Experiments index and the
 * navigation all read from here, so adding an experiment starts with an entry.
 */
export const experiments: ExperimentMeta[] = [
  {
    id: 'microfrontend',
    title: 'Microfrontend Playground',
    path: '/experiments/microfrontend',
    summary:
      'Compare a monolith with independently deployed microfrontends. Take a team’s module offline and watch how far the failure spreads.',
    tryThis: 'Take the Workspace MFE offline',
    concepts: ['Microfrontends', 'Fault isolation', 'Lazy loading', 'Caching'],
    icon: Boxes,
    status: 'available',
  },
  {
    id: 'resilience',
    title: 'Resilience Playground',
    path: '/experiments/resilience',
    summary:
      'Break distributed systems and experiment with resilience patterns. Kill services, add latency, then compare retries, circuit breakers, caching and queues.',
    tryThis: 'Kill Payment Service, then enable a circuit breaker',
    concepts: ['Retries', 'Circuit breaker', 'Caching', 'Async processing'],
    icon: ShieldAlert,
    status: 'available',
  },
  {
    id: 'simulator',
    title: 'Architecture Decision Simulator',
    path: '/simulator',
    summary:
      'Pick a system-design challenge, drag components onto a canvas and wire them up. Get scored on scalability, reliability, cost and more.',
    tryThis: 'Design a video streaming platform',
    concepts: ['System design', 'Trade-offs', 'Scalability', 'Cost'],
    icon: Workflow,
    status: 'coming-soon',
  },
]
