/**
 * What each action is for, in the operator's terms: the problem it tries to
 * solve, when it helps, when it may not, and what it costs beyond money.
 *
 * Presentation copy keyed by the scenario's decision ids. The numbers (cost,
 * minutes, complexity) always come from the engine's preview, never from here,
 * and nothing here says how much an action will help: the engine decides that.
 */
import type { ActionView } from './session'

export type IntentGroup = 'investigate' | 'capacity' | 'protect' | 'optimize' | 'cost'

export interface ActionIntent {
  group: IntentGroup
  /** One line: the problem this action tries to solve. */
  purpose: string
  helpsIf?: string
  mayNotHelpIf?: string
  tradeOffs?: string[]
}

export const GROUPS: { id: IntentGroup; title: string; note: string }[] = [
  { id: 'investigate', title: 'Investigate', note: 'Learn before you commit. The incident keeps moving.' },
  { id: 'capacity', title: 'Add capacity', note: 'Give a component more room.' },
  { id: 'protect', title: 'Reduce load / protect', note: 'Shed or defer work to keep the rest healthy.' },
  { id: 'optimize', title: 'Optimize', note: 'Do the same work more cheaply.' },
  { id: 'cost', title: 'Give back cost', note: 'Undo capacity you no longer need.' },
]

const INTENTS: Record<string, ActionIntent> = {
  'investigate-traffic': {
    group: 'investigate',
    purpose: 'Learn what the traffic is made of: how much is reads, and how much a cache could serve.',
  },
  'investigate-database': {
    group: 'investigate',
    purpose: 'Learn how loaded PostgreSQL is, how slow its queries are, and what writes cost it.',
  },
  'scale-application': {
    group: 'capacity',
    purpose: 'Increase application capacity.',
    helpsIf: 'The application tier is the bottleneck.',
    mayNotHelpIf: 'The database is already saturated: a bigger application sends it even more work.',
    tradeOffs: ['Adds to the monthly bill for every instance'],
  },
  'add-database-replica': {
    group: 'capacity',
    purpose: 'Move half of the database reads to a second PostgreSQL server.',
    helpsIf: 'Read pressure on the database is significant.',
    mayNotHelpIf: 'The pressure comes from writes: every write still goes to the primary.',
    tradeOffs: ['Replica lag: reads can be slightly stale', 'One more database to run'],
  },
  'upgrade-database': {
    group: 'capacity',
    purpose: 'Increase database capacity by moving to a larger instance.',
    helpsIf: 'PostgreSQL is the bottleneck.',
    mayNotHelpIf: 'The bottleneck is in front of the database: the application fails requests before they reach it.',
    tradeOffs: ['Doubles the database bill', 'A failover first: the database runs degraded for a few minutes'],
  },
  'enable-rate-limiting': {
    group: 'protect',
    purpose: 'Cap incoming traffic at the gateway to protect everything behind it.',
    helpsIf: 'The system is overloaded and serving some users well beats failing many.',
    mayNotHelpIf: 'The limit is above what the backend can actually handle.',
    tradeOffs: ['Rejected requests count as unavailable', 'Real users are turned away'],
  },
  'tighten-rate-limit': {
    group: 'protect',
    purpose: 'Admit less traffic through the gateway.',
    helpsIf: 'The backend is still overloaded behind the current limit.',
    tradeOffs: ['More users are rejected'],
  },
  'relax-rate-limit': {
    group: 'protect',
    purpose: 'Admit more traffic through the gateway.',
    helpsIf: 'The backend has headroom behind the current limit.',
    tradeOffs: ['The backend takes more load'],
  },
  'enable-async-writes': {
    group: 'protect',
    purpose: 'Move writes out of the synchronous request path.',
    helpsIf: 'Writes are a meaningful part of the database’s load.',
    mayNotHelpIf: 'The database’s load is mostly reads: a queue only defers writes.',
    tradeOffs: ['Writes are applied later', 'The queue can fill up', 'Users may not see their own changes right away'],
  },
  'enable-cache': {
    group: 'optimize',
    purpose: 'Take read traffic off the database by answering it from a cache.',
    helpsIf: 'Much of the traffic is cacheable reads, and database reads are part of the bottleneck.',
    mayNotHelpIf: 'Little of the traffic is cacheable, or the bottleneck is elsewhere.',
    tradeOffs: ['Starts cold and needs minutes to warm up', 'Another system to operate', 'Data can be slightly stale'],
  },
  'scale-down-application': {
    group: 'cost',
    purpose: 'Remove application instances to save money.',
    helpsIf: 'The application has spare capacity and cost matters.',
    tradeOffs: ['Less headroom if traffic rises again'],
  },
  'remove-database-replica': {
    group: 'cost',
    purpose: 'Stop paying for the replica and send every read back to the primary.',
    helpsIf: 'The primary can take the reads again.',
    tradeOffs: ['The primary carries all reads again'],
  },
  'downgrade-database': {
    group: 'cost',
    purpose: 'Halve the database bill by failing back to the standard instance.',
    helpsIf: 'The database has plenty of headroom and cost matters.',
    tradeOffs: ['A failover first: degraded for a few minutes', 'Half the capacity afterwards'],
  },
}

/** The intent behind an action; actions this file does not know fall back to their own description. */
export function intentOf(action: Pick<ActionView, 'id' | 'kind' | 'description'>): ActionIntent {
  return INTENTS[action.id] ?? { group: action.kind === 'investigate' ? 'investigate' : 'optimize', purpose: action.description }
}

export function groupActions<T extends Pick<ActionView, 'id' | 'kind' | 'description'>>(actions: T[]): { group: (typeof GROUPS)[number]; actions: T[] }[] {
  return GROUPS.map((group) => ({ group, actions: actions.filter((action) => intentOf(action).group === group.id) })).filter((entry) => entry.actions.length > 0)
}
