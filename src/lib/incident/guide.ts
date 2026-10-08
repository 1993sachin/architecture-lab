/**
 * Scenario guides: the scenario-specific teaching content, kept as data next
 * to the generic reasoning code that uses it.
 *
 * A guide says what each of the scenario's decisions is for and what each
 * hidden fact means once it is learned. It never says how much a decision
 * will help: the engine decides outcomes, and the reasoning layer explains
 * them from what actually moved.
 */
import type { MetricDelta, MetricKey, IncidentView } from './session'
import type { Hypothesis } from './reasoning'
import { trafficIncidentGuide } from './guides/trafficIncident'

export type IntentGroup = 'investigate' | 'capacity' | 'protect' | 'optimize' | 'cost'

export const GROUPS: { id: IntentGroup; title: string; note: string }[] = [
  { id: 'investigate', title: 'Investigate', note: 'Learn before you commit. The incident keeps moving.' },
  { id: 'capacity', title: 'Add capacity', note: 'Give a component more room.' },
  { id: 'protect', title: 'Reduce load / protect', note: 'Shed or defer work to keep the rest healthy.' },
  { id: 'optimize', title: 'Optimize', note: 'Do the same work more cheaply.' },
  { id: 'cost', title: 'Give back cost', note: 'Undo capacity you no longer need.' },
]

/** A direction an action pushes a number in, when its premise holds. */
export interface ExpectedChange {
  label: string
  direction: 'up' | 'down'
  /** The condition the change depends on, e.g. "if database pressure is contributing". */
  when?: string
}

/** What the reasoning layer hands a guide to explain a consequence, all of it observable. */
export interface ConsequenceContext {
  before: IncidentView
  after: IncidentView
  delta: (key: MetricKey) => MetricDelta | undefined
  /** "130% → 100%" for a metric that moved and was visible on both sides. */
  show: (key: MetricKey) => string | null
  value: (key: MetricKey) => number | null
  /** The database's display name, e.g. "PostgreSQL". */
  database: string
  /** One line on how the database's load moved, or that it cannot be seen. */
  databaseMove: () => string | null
  databaseUnknown: boolean
  impactBetter: boolean
  impactWorse: boolean
}

export interface DecisionGuide {
  group: IntentGroup
  /** One line: what it tries to accomplish. */
  goal: string
  helpsWhen?: string[]
  mayNotHelpWhen?: string[]
  /** Expected direction of change, when the premise holds. */
  improves?: ExpectedChange[]
  tradeoffs?: string[]
  /** What starts to matter once this is in place. */
  newRisk?: string
  /** The possible causes this is aimed at; their current evidence is shown alongside. */
  addresses?: Hypothesis['id'][]
  /** Why the visible numbers moved, in this decision's terms. Only from observed deltas. */
  consequence?: (ctx: ConsequenceContext) => string[]
}

export interface FactGuide {
  /** Before it is learned: what you don't know, and why it matters. */
  unknown: string
  /** After: what the value means for the incident. Hedged; never a verdict. */
  interpret?: (value: number, view: IncidentView) => string
}

export interface ScenarioGuide {
  scenarioId: string
  /** Which hidden facts play the roles the generic reasoning understands. */
  facts: { databaseLoad?: string; readShare?: string; cacheableShare?: string }
  decisions: Record<string, DecisionGuide>
  factGuides: Record<string, FactGuide>
}

const GUIDES: ScenarioGuide[] = [trafficIncidentGuide]

const EMPTY: ScenarioGuide = { scenarioId: '', facts: {}, decisions: {}, factGuides: {} }

export function guideFor(scenarioId: string): ScenarioGuide {
  return GUIDES.find((guide) => guide.scenarioId === scenarioId) ?? EMPTY
}
