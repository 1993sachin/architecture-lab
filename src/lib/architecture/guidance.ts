import { GROUPS } from './catalog'
import { buildGraph, downstream, has, hasReachable } from './graph'
import type { Architecture, Challenge, ComponentType } from './types'

/**
 * Teaching content for the designer: Coach Mode questions, short "Why?"
 * answers and progressive hints. Questions never solve the design; they make
 * the visitor state the reason for a choice.
 */

export interface CoachPrompt {
  question: string
  explain: string
}

const COACH: Partial<Record<ComponentType, (c: Challenge) => CoachPrompt>> = {
  sql: () => ({
    question: 'What role does this database play? Which data must never be lost, and who reads it most?',
    explain:
      'A relational database gives transactions and flexible queries. It is usually the system of record, so its availability and write capacity often decide the whole design.',
  }),
  nosql: () => ({
    question: 'What will you look this data up by? A key-value or document store is fast when you always know the key.',
    explain: 'NoSQL stores scale out easily for simple access patterns, at the cost of joins and multi-record transactions.',
  }),
  cdn: () => ({
    question: 'CDNs are great for cacheable content. What data are you planning to serve through it?',
    explain:
      'A CDN only helps with responses that can be cached at the edge: static files, media, or redirects that rarely change. Personalised or fast-changing responses still go to your origin.',
  }),
  cache: (c) => ({
    question: 'Which reads will this cache absorb, and what happens when the cached copy is out of date?',
    explain: c.profile.readHeavy
      ? 'This workload is read-heavy, so a cache can take most reads off the database. Decide how entries expire or get invalidated when the source changes.'
      : 'A cache trades freshness for speed. It pays off when the same data is read far more often than it changes.',
  }),
  queue: () => ({
    question: 'What work can wait? Which part of the request does the user not need to watch finish?',
    explain:
      'A queue lets the request return early while a worker finishes the rest. You gain resilience to spikes and failures, and accept eventual consistency.',
  }),
  eventBus: () => ({
    question: 'Who needs to hear about this event, and should the publisher care whether they did?',
    explain:
      'An event bus lets many consumers react independently, which decouples teams but makes the overall flow harder to trace.',
  }),
  stream: () => ({
    question: 'Does anyone need to replay these events later, or read them in order?',
    explain:
      'A stream keeps an ordered, replayable log. Useful for analytics and rebuilding state, heavier to run than a simple queue.',
  }),
  gateway: () => ({
    question: 'What should every request go through before it reaches your services?',
    explain:
      'A gateway is a single front door for routing, authentication and rate limiting. Because everything passes through it, it needs to be highly available.',
  }),
  loadBalancer: () => ({
    question: 'How many copies of the thing behind this load balancer will you run?',
    explain:
      'A load balancer only adds value in front of several instances. It spreads traffic and routes around an instance that fails.',
  }),
  service: (c) => ({
    question:
      `Which responsibility does this service own? ${c.services[0] ? `For example, a ${c.services[0].name}.` : ''}`.trim(),
    explain: 'Naming a service after the job it does makes the design readable and shows whether one service is doing too much.',
  }),
  worker: () => ({
    question: 'Where does this worker get its work from?',
    explain: 'Workers usually consume from a queue or stream, so slow or failing jobs never block a user-facing request.',
  }),
  objectStorage: () => ({
    question: 'Which large files will live here, and how will users download them?',
    explain: 'Object storage is cheap and durable for big blobs. Put a CDN in front when many users download the same files.',
  }),
  search: () => ({
    question: 'Which queries can your database not answer well that this engine will?',
    explain:
      'A search engine handles full-text and faceted queries. It is a second copy of your data that has to be kept in sync.',
  }),
  rateLimiter: () => ({
    question: 'Who are you protecting, and from whom?',
    explain:
      'A rate limiter caps how fast one client can call you, protecting capacity and third-party quotas from abuse or bugs.',
  }),
  auth: () => ({
    question: 'Which requests need to know who the user is?',
    explain: 'A dedicated auth service issues and checks identities so every other service does not reimplement it.',
  }),
}

export function coachPrompt(type: ComponentType, challenge: Challenge): CoachPrompt | null {
  return COACH[type]?.(challenge) ?? null
}

const WHY: Partial<Record<ComponentType, (c: Challenge) => string>> = {
  client: () => 'Every request starts somewhere: a browser or a mobile app.',
  webapp: () => 'Renders pages on the server, so the browser gets HTML instead of building it.',
  gateway: () => 'One front door for routing, authentication and throttling, instead of exposing every service.',
  loadBalancer: () => 'Spreads traffic over several instances and routes around one that fails.',
  service: () => 'Holds the business logic. Stateless, so you can add copies when traffic grows.',
  worker: (c) =>
    c.profile.asyncWork
      ? 'This challenge has slow background work; a worker does it outside the user’s request.'
      : 'Does background work outside the user’s request.',
  function: () => 'Runs code on demand and scales to zero: good for spiky, short tasks.',
  sql: (c) =>
    c.profile.strongConsistency
      ? 'Money or stock is involved, and transactions keep it correct.'
      : 'Durable, queryable storage with transactions: a solid system of record.',
  nosql: (c) =>
    c.profile.writeHeavy
      ? 'This workload writes a lot; a NoSQL store spreads writes across nodes.'
      : 'Fast lookups by key, and it scales out easily.',
  cache: (c) =>
    c.profile.readHeavy
      ? 'Because this workload is read-heavy. Caching can reduce repeated database reads and improve latency.'
      : 'Keeps hot data in memory so repeated reads skip the database.',
  objectStorage: (c) =>
    c.profile.media
      ? 'Large media files belong in cheap, durable blob storage, not in a database.'
      : 'Cheap, durable storage for files and blobs.',
  search: () => 'Answers full-text and filter queries that a database handles poorly.',
  queue: (c) =>
    c.profile.asyncWork
      ? 'Lets the request return now while slow work happens later, and absorbs spikes.'
      : 'Decouples producers from consumers and absorbs spikes.',
  eventBus: () => 'Lets several consumers react to the same event without the producer knowing them.',
  stream: (c) =>
    c.profile.analytics
      ? 'Analytics needs an ordered, replayable record of what happened.'
      : 'An ordered, replayable log of events.',
  cdn: (c) =>
    c.profile.global || c.profile.media
      ? 'Users are far apart or download big files; serving cacheable content from the edge cuts latency and origin traffic.'
      : 'Serves cacheable content close to users and offloads your origin.',
  dns: () => 'Routes users to the nearest healthy region.',
  auth: () => 'Centralises identity so each service does not reimplement login and tokens.',
  rateLimiter: (c) =>
    c.profile.rateLimiting
      ? 'This system can be abused or flooded; capping per-client rate protects it.'
      : 'Caps how fast one client can call you.',
  logging: () => 'Tells you what happened after something breaks.',
  metrics: () => 'Tells you something is breaking before users do.',
  tracing: () => 'Shows where time goes as a request crosses services.',
}

export function whyComponent(type: ComponentType, challenge: Challenge): string {
  return WHY[type]?.(challenge) ?? ''
}

export interface HintSet {
  id: string
  hints: [string, string, string]
}

/**
 * Progressive hints for the next thing a design is missing: a conceptual
 * clue, a narrower nudge, then the answer.
 */
export function nextHints(arch: Architecture, challenge: Challenge): HintSet {
  const g = buildGraph(arch)
  const p = challenge.profile
  const client = arch.nodes.find((n) => n.type === 'client')
  const front = client ? (g.out.get(client.id) ?? []) : []

  if (!has(g, 'gateway', 'loadBalancer', 'webapp', 'service', 'function')) {
    return {
      id: 'entry',
      hints: [
        'Think about which component should receive the user’s request first.',
        'You probably want something between the client and your services.',
        'An API Gateway is a common entry point: add one and connect the Client to it.',
      ],
    }
  }
  if (!has(g, 'sql', 'nosql', 'objectStorage')) {
    return {
      id: 'storage',
      hints: [
        'What does this system need to remember after a request is over?',
        'Look in the Data group of the palette.',
        p.strongConsistency
          ? 'Add a SQL Database: transactions keep this data correct.'
          : 'Add a database (SQL or NoSQL) and connect your service to it.',
      ],
    }
  }
  if (!front.length || !hasReachable(g, 'sql', 'nosql', 'objectStorage')) {
    return {
      id: 'connect',
      hints: [
        'Follow one request from the Client. Where does it go, step by step?',
        'Connections point the way requests travel: drag from a dot on one component to a dot on the next.',
        'Connect Client → entry point → service → database, so a request can reach the data.',
      ],
    }
  }
  const services = arch.nodes.filter((n) => GROUPS.compute.includes(n.type) && n.type !== 'client')
  const readsDb = services.some((s) => downstream(g, s.id).some((d) => d.type === 'sql' || d.type === 'nosql'))
  if (p.readHeavy && readsDb && !has(g, 'cache', 'cdn')) {
    return {
      id: 'reads',
      hints: [
        'Most requests here read the same data again and again.',
        'Something in memory could answer repeated reads before they reach the database.',
        'Add a Cache between your service and the database.',
      ],
    }
  }
  if ((p.global || p.media) && !has(g, 'cdn')) {
    return {
      id: 'edge',
      hints: [
        'Where are your users, and how far are they from your servers?',
        'Content that can be cached could be served from close to each user.',
        'Add a CDN in front of the content users download.',
      ],
    }
  }
  if (p.asyncWork && !has(g, 'queue', 'eventBus', 'stream')) {
    return {
      id: 'async',
      hints: [
        'Does the user really need to wait for every part of this request?',
        'Slow work could be handed off and finished later.',
        'Add a Message Queue and a Worker that consumes from it.',
      ],
    }
  }
  return {
    id: 'evaluate',
    hints: [
      'Your design covers the basics. Find out what the evaluator thinks of it.',
      'Press Evaluate Architecture and read the Potential Problems.',
      'Evaluate, then try one recommended improvement and Re-Evaluate to compare.',
    ],
  }
}
