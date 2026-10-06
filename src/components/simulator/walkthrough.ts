import {
  buildGraph,
  downstream,
  type Architecture,
  type ArchitectureEvaluation,
  type ComponentType,
  type ValidationResult,
} from '@/lib/architecture'
import type { GuidedExperimentDef } from '@/lib/guide/types'

export const WALKTHROUGH_ID = 'simulator-url-shortener'
export const WALKTHROUGH_CHALLENGE = 'url-shortener'

export interface WalkthroughState {
  arch: Architecture
  validation: ValidationResult
  /** The evaluation of the design as it is now, if there is one. */
  evaluation: ArchitectureEvaluation | null
}

export interface WalkthroughActions {
  /** Starts a fresh URL Shortener design. */
  begin: () => void
  /** Adds a component at a readable spot on the canvas. */
  add: (type: ComponentType, label?: string) => void
  evaluate: () => void
}

const hasType = (s: WalkthroughState, ...types: ComponentType[]) => s.arch.nodes.some((n) => types.includes(n.type))
const STORES: ComponentType[] = ['sql', 'nosql']
const SERVICES: ComponentType[] = ['service', 'function']

function flow(s: WalkthroughState) {
  const g = buildGraph(s.arch)
  const reach = (type: ComponentType[]) => s.arch.nodes.some((n) => type.includes(n.type) && g.reachable.has(n.id))
  const gateways = s.arch.nodes.filter((n) => n.type === 'gateway')
  const services = s.arch.nodes.filter((n) => SERVICES.includes(n.type))
  return {
    gatewayReached: reach(['gateway']),
    gatewayToService: gateways.some((gw) => downstream(g, gw.id).some((d) => SERVICES.includes(d.type))),
    serviceToData: services.some((sv) => {
      const below = downstream(g, sv.id)
      return below.some((d) => d.type === 'cache') && below.some((d) => STORES.includes(d.type))
    }),
    cdnPlaced: s.arch.nodes.some((n) => n.type === 'cdn' && g.reachable.has(n.id) && (g.out.get(n.id)?.length ?? 0) > 0),
  }
}

/** The beginner walkthrough: reason about each piece first, then build, connect and evaluate for real. */
export function urlShortenerWalkthrough(a: WalkthroughActions): GuidedExperimentDef<WalkthroughState> {
  return {
    id: WALKTHROUGH_ID,
    title: 'Design a URL Shortener',
    scenario: 'Design a URL Shortener',
    introduction:
      'You’ll reason about each building block before you place it, then evaluate your design with the real evaluator.',
    steps: [
      {
        id: 'mission',
        title: 'Understand the problem',
        description: 'Your mission: build a service that converts long URLs into short URLs.',
        details: [
          'Users create short URLs',
          'Users open short URLs',
          'Redirects should be fast',
          'The system handles far more reads than writes',
        ],
        phase: 'choose',
        tasks: [
          {
            id: 'start',
            label: 'Start with an empty canvas and a Client',
            done: (_, ctx) => !!ctx.flags.started,
            action: { label: 'Start Designing', run: a.begin, flag: 'started' },
          },
        ],
        explanation: 'The canvas has one Client: that is your users. Everything else is yours to decide.',
      },
      {
        id: 'entry',
        title: 'Identify the entry point',
        description: 'Every request needs an entry point.',
        phase: 'build',
        question: {
          id: 'entry',
          prompt: 'What component should receive requests from users?',
          options: [
            {
              id: 'client',
              label: 'Client',
              feedback:
                'The Client is where requests come from, not where they arrive. Think about where HTTP requests should enter the system.',
            },
            { id: 'gateway', label: 'API Gateway', correct: true, feedback: 'The API Gateway is an appropriate entry point.' },
            {
              id: 'db',
              label: 'Database',
              feedback:
                'Users should never talk to the database directly. Think about where HTTP requests should enter the system.',
            },
          ],
        },
        tasks: [
          {
            id: 'add',
            label: 'Add an API Gateway to the canvas',
            done: (s) => hasType(s, 'gateway'),
            action: { label: 'Add API Gateway', run: () => a.add('gateway') },
            target: 'palette-gateway',
          },
        ],
        explanation: 'Every request now has one front door, where routing, authentication and rate limiting can live.',
        hints: [
          'Think about where HTTP traffic enters the system.',
          'You probably want something between the client and your services.',
          'An API Gateway is a common entry point.',
        ],
      },
      {
        id: 'storage',
        title: 'Add storage',
        description: 'Your system needs to remember the relationship between long URLs and short URLs.',
        phase: 'build',
        question: {
          id: 'storage',
          prompt: 'What should store this data?',
          options: [
            { id: 'db', label: 'Database', correct: true, feedback: 'Good. The database stores the URL mapping.' },
            { id: 'cdn', label: 'CDN', feedback: 'A CDN caches copies near users, but it is not where data is kept for good.' },
            {
              id: 'queue',
              label: 'Message Queue',
              feedback: 'A queue holds messages until they are processed, then they are gone.',
            },
          ],
        },
        tasks: [
          {
            id: 'add',
            label: 'Add a database to the canvas',
            done: (s) => hasType(s, ...STORES),
            action: { label: 'Add SQL Database', run: () => a.add('sql') },
            target: 'palette-sql',
          },
        ],
        explanation: 'The database is the system of record: every short code and its long URL, kept durably.',
        hints: [
          'The mapping must survive restarts and never be lost.',
          'Only one of these keeps data permanently.',
          'A database stores the URL mapping.',
        ],
      },
      {
        id: 'reads',
        title: 'Handle high read traffic',
        description: 'Opening a short URL happens much more frequently than creating one.',
        phase: 'build',
        question: {
          id: 'reads',
          prompt: 'What could reduce repeated database reads?',
          options: [
            {
              id: 'cache',
              label: 'Cache',
              correct: true,
              feedback: 'Popular links can be answered from memory without touching the database.',
            },
            { id: 'queue', label: 'Message Queue', feedback: 'A queue delays work; a redirect has to be answered right now.' },
            {
              id: 'lb',
              label: 'Load Balancer',
              feedback: 'A load balancer spreads requests, but every one of them still reads the database.',
            },
          ],
        },
        tasks: [
          {
            id: 'add',
            label: 'Add a Cache to the canvas',
            done: (s) => hasType(s, 'cache'),
            action: { label: 'Add Cache', run: () => a.add('cache') },
            target: 'palette-cache',
          },
        ],
        explanation: 'Hot links will be served from memory. The database only sees cache misses and new links.',
        hints: [
          'The same short links are opened again and again.',
          'Something fast could remember recent answers.',
          'A cache in front of the database absorbs repeated reads.',
        ],
      },
      {
        id: 'edge',
        title: 'Improve global performance',
        description: 'Users may be distributed globally.',
        phase: 'build',
        question: {
          id: 'edge',
          prompt: 'What could reduce latency for content that can be cached close to users?',
          options: [
            {
              id: 'cdn',
              label: 'CDN',
              correct: true,
              feedback: 'A CDN answers cacheable redirects from an edge location near each user.',
            },
            { id: 'db', label: 'Database', feedback: 'A database lives in one place; distance to users stays the same.' },
            { id: 'queue', label: 'Message Queue', feedback: 'A queue does not bring anything closer to the user.' },
          ],
        },
        tasks: [
          {
            id: 'add',
            label: 'Add a CDN to the canvas',
            done: (s) => hasType(s, 'cdn'),
            action: { label: 'Add CDN', run: () => a.add('cdn') },
            target: 'palette-cdn',
          },
        ],
        explanation: 'Popular redirects can now be answered at the edge, before they ever reach your servers.',
        hints: [
          'Distance adds latency that no server can remove.',
          'You want copies of cacheable answers near users.',
          'A CDN serves cached content close to users.',
        ],
      },
      {
        id: 'connect',
        title: 'Connect everything',
        description:
          'Connect the architecture. Drag from a dot on one component to a dot on the next, in the direction requests travel. There is more than one valid layout.',
        phase: 'build',
        tasks: [
          {
            id: 'service',
            label: 'Add a service that creates links and handles redirects',
            done: (s) => hasType(s, ...SERVICES),
            action: { label: 'Add Shortener Service', run: () => a.add('service', 'Shortener Service') },
            target: 'palette-service',
          },
          { id: 'entry', label: 'Requests flow from the Client to the API Gateway', done: (s) => flow(s).gatewayReached },
          { id: 'route', label: 'The API Gateway forwards to your service', done: (s) => flow(s).gatewayToService },
          { id: 'data', label: 'The service reaches the Cache and the database', done: (s) => flow(s).serviceToData },
          { id: 'cdn', label: 'The CDN sits on the request path with an origin behind it', done: (s) => flow(s).cdnPlaced },
        ],
        validation: (s) => {
          const f = flow(s)
          return (
            hasType(s, ...SERVICES) &&
            f.gatewayReached &&
            f.gatewayToService &&
            f.serviceToData &&
            f.cdnPlaced &&
            !s.validation.issues.some((i) => i.severity === 'error')
          )
        },
        explanation: 'A request can now travel from the user to the data. Your design is complete enough to judge.',
        hints: [
          'Follow one redirect from the user: where does it go first, and where does it end?',
          'Connections point the way requests travel: Client → … → database. The CDN sits in front of what it caches.',
          'One valid layout: Client → CDN → API Gateway → Shortener Service, then Service → Cache and Service → SQL Database.',
        ],
      },
      {
        id: 'evaluate',
        title: 'Evaluate',
        description: 'You’ve designed your first system. Run the same evaluator every design in the simulator gets.',
        phase: 'observe',
        tasks: [
          {
            id: 'evaluate',
            label: 'Evaluate the design',
            done: (s) => !!s.evaluation,
            action: { label: 'Evaluate My Architecture', run: a.evaluate },
          },
        ],
        explanation: (s) =>
          s.evaluation
            ? `Your design scores ${s.evaluation.overallScore.toFixed(1)} / 10. The full breakdown is below the canvas.`
            : '',
        hints: ['Time to find out how it holds up.', 'Use the evaluate button.', 'Press “Evaluate My Architecture”.'],
      },
      {
        id: 'result',
        title: 'Read the result',
        description: 'Every choice bought something and cost something.',
        phase: 'understand',
        validation: () => true,
        explanation: (s) => {
          const has = (t: ComponentType) => s.arch.nodes.some((n) => n.type === t)
          const parts = [has('cache') && 'read performance with caching', has('cdn') && 'global delivery with a CDN'].filter(
            Boolean,
          )
          return parts.length ? `You optimized for ${parts.join(' and ')}.` : 'You built a working read and write path.'
        },
        observe:
          'But… the cache introduces consistency and invalidation considerations: a link that is changed or deleted can keep redirecting until its cached copy expires. Check Potential Problems below for what the evaluator would improve next.',
      },
    ],
    completionMessage:
      'You designed, connected and evaluated your first system. There was no single correct answer: you chose fast reads and edge delivery, and accepted cache invalidation and extra moving parts in return.',
    learned: {
      topic: 'System design',
      points: [
        { term: 'Entry points', detail: 'one front door for every request' },
        { term: 'Durable storage', detail: 'the system of record' },
        { term: 'Caching', detail: 'absorbs read-heavy traffic' },
        { term: 'Edge delivery', detail: 'cuts distance to users' },
        { term: 'Trade-offs', detail: 'speed versus freshness and complexity' },
      ],
    },
    next: [{ label: 'Try Another Challenge', to: '/simulator' }],
  }
}
