import { GROUPS } from './catalog'
import { getChallenge } from './challenges'
import { buildGraph, downstream, has, isComputeLike, labelMatches, ofType } from './graph'
import type { Architecture, DesignNode, IssueSeverity, ValidationIssue, ValidationResult } from './types'

const DATA_STORES = ['sql', 'nosql', 'cache', 'search'] as const
const isDataStore = (n: DesignNode) => (DATA_STORES as readonly string[]).includes(n.type)
const isMessaging = (n: DesignNode) => GROUPS.messaging.includes(n.type)
const isObservability = (n: DesignNode) => GROUPS.observability.includes(n.type)

/**
 * Structural checks that run before evaluation. Errors are design mistakes,
 * warnings are probably unintended, suggestions are optional. Only a design
 * with nothing to evaluate is blocked.
 */
export function validateArchitecture(arch: Architecture): ValidationResult {
  const g = buildGraph(arch)
  const issues: ValidationIssue[] = []
  const add = (severity: IssueSeverity, id: string, message: string, nodeIds: string[] = []) =>
    issues.push({ id, severity, message, nodeIds })

  if (arch.nodes.length === 0) {
    return { issues: [], canEvaluate: false, blockingReason: 'Drag components onto the canvas to start designing.' }
  }

  const hasEntry = has(g, ...GROUPS.entry)
  if (!hasEntry && !has(g, 'gateway'))
    add('error', 'no-entry', 'No client or gateway is present. Requests need somewhere to come from.')
  else if (!hasEntry) add('warning', 'no-client', 'There is no Client. Add one so requests have a source.')

  // Invalid flows: connections point the way requests travel.
  for (const e of arch.edges) {
    const s = g.byId.get(e.source)
    const t = g.byId.get(e.target)
    if (!s || !t) continue
    if (t.type === 'client') {
      add(
        'error',
        `into-client-${e.id}`,
        `${s.label} cannot directly initiate a request to the client. Draw connections in the direction requests travel.`,
        [s.id, t.id],
      )
    } else if (
      (isDataStore(s) || s.type === 'objectStorage') &&
      !isDataStore(t) &&
      !isMessaging(t) &&
      t.type !== 'objectStorage' &&
      t.type !== 'cdn'
    ) {
      add(
        'error',
        `data-initiates-${e.id}`,
        `${s.label} cannot initiate a request to ${t.label}. Data stores answer requests; they do not make them.`,
        [s.id, t.id],
      )
    } else if (s.type === 'client' && isDataStore(t)) {
      add(
        'error',
        `client-to-data-${e.id}`,
        `The client talks to ${t.label} directly. Put a service in between to own access and validation.`,
        [s.id, t.id],
      )
    } else if (s.type === 'client' && isMessaging(t)) {
      add(
        'warning',
        `client-to-messaging-${e.id}`,
        `The client publishes to ${t.label} directly. Usually a service validates requests first.`,
        [s.id, t.id],
      )
    }
  }

  for (const n of arch.nodes) {
    const outs = g.out.get(n.id) ?? []
    const ins = g.in.get(n.id) ?? []
    if (outs.length + ins.length === 0) {
      if (isObservability(n)) continue
      const what = isDataStore(n) || isMessaging(n) ? 'any service' : 'anything'
      if (arch.nodes.length > 1) add('warning', `orphan-${n.id}`, `${n.label} is not connected to ${what}.`, [n.id])
      continue
    }
    if (!g.reachable.has(n.id) && !isObservability(n) && n.type !== 'client') {
      add('warning', `unreachable-${n.id}`, `${n.label} is not reachable from the client, so no request ever gets there.`, [n.id])
    }
    if (isMessaging(n)) {
      if (outs.length === 0)
        add('warning', `no-consumer-${n.id}`, `${n.label} has no consumer. Nothing processes its messages.`, [n.id])
      if (ins.length === 0) add('warning', `no-producer-${n.id}`, `${n.label} has no producer. Nothing publishes to it.`, [n.id])
    }
    if (n.type === 'cdn' && outs.length === 0)
      add(
        'warning',
        `cdn-origin-${n.id}`,
        `${n.label} has no origin. Connect it to object storage or a web app it can fetch from.`,
        [n.id],
      )
    if ((n.type === 'loadBalancer' || n.type === 'gateway') && outs.length === 0) {
      add('warning', `routes-nowhere-${n.id}`, `${n.label} does not route to anything.`, [n.id])
    }
    if ((n.type === 'service' || n.type === 'worker') && ins.length + outs.length > 0) {
      const stores = downstream(g, n.id).filter((d) => isDataStore(d) || d.type === 'objectStorage' || isMessaging(d))
      if (stores.length === 0) add('warning', `no-store-${n.id}`, `${n.label} is not connected to a database.`, [n.id])
    }
  }

  if (!has(g, 'sql', 'nosql', 'objectStorage')) {
    add('error', 'no-persistence', 'Nothing stores data durably. Add a database or object storage.')
  }

  const challenge = getChallenge(arch.challengeId)
  if (challenge) {
    const services = arch.nodes.filter(isComputeLike)
    for (const dep of challenge.dependencies) {
      const dependents = services.filter((s) => labelMatches(s, dep.when))
      if (dependents.length && !services.some((s) => labelMatches(s, dep.requires))) {
        add(
          'warning',
          `dep-${dep.when[0]}-${dep.requires[0]}`,
          dep.message,
          dependents.map((d) => d.id),
        )
      }
    }
  }

  const generic = ofType(g, 'service').filter((s) => s.label === 'Service' || /^Service \d+$/.test(s.label))
  if (generic.length >= 2) {
    add(
      'suggestion',
      'name-services',
      'Name your services (for example "Payment Service") so the design reads like a system and the evaluator can match them to requirements.',
      generic.map((s) => s.id),
    )
  }
  if (!has(g, ...GROUPS.observability) && arch.nodes.length >= 4) {
    add('suggestion', 'observability', 'Nothing observes this system. Logging, metrics or tracing tell you when it breaks.')
  }

  const blocking = !has(g, ...GROUPS.entry, 'gateway')
    ? 'Add a Client (or an API Gateway) so requests have an entry point.'
    : arch.edges.length === 0
      ? 'Connect your components: drag from one component’s handle to another.'
      : undefined
  const order: Record<IssueSeverity, number> = { error: 0, warning: 1, suggestion: 2 }
  issues.sort((a, b) => order[a.severity] - order[b.severity])
  return { issues, canEvaluate: !blocking, blockingReason: blocking }
}
