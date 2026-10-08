/**
 * Postmortem, comparison and replay helpers over the engine.
 *
 * Everything here is derived from engine data: the postmortem the engine
 * builds, and further runs of the same deterministic simulation. Nothing is
 * generated or judged by a model.
 */
import {
  playbookActions,
  replay,
  trafficIncidentPlaybooks,
  type LearningSignal,
  type Playbook,
  type PlaybookStep,
  type Postmortem,
  type Scenario,
  type Simulation,
  type SimulationAction,
} from '@architecture-lab/engine'
import { SCENARIO } from './session'

export const PLAYBOOKS: readonly Playbook[] = trafficIncidentPlaybooks

/** The numbers two runs are compared on. */
export interface RunSummary {
  label: string
  outcome: Postmortem['summary']['outcome']
  score: number
  stabilizedAt: number | null
  timeToStabilize: number | null
  sloViolationMinutes: number
  failedRequests: number
  throttledRequests: number
  businessImpact: number
  finalMonthlyCost: number
  incidentSpend: number
  complexity: number
  peakP99: number
  availability: number
  decisions: string[]
}

export function summarize(label: string, simulation: Simulation): RunSummary {
  const postmortem = simulation.getPostmortem()
  return {
    label,
    outcome: postmortem.summary.outcome,
    score: postmortem.summary.score,
    stabilizedAt: postmortem.summary.stabilizedAt,
    timeToStabilize: postmortem.summary.timeToStabilize,
    sloViolationMinutes: postmortem.impact.sloViolationMinutes,
    failedRequests: postmortem.impact.failedRequests,
    throttledRequests: postmortem.impact.throttledRequests,
    businessImpact: postmortem.impact.businessImpact ?? 0,
    finalMonthlyCost: postmortem.cost.finalMonthlyCost,
    incidentSpend: postmortem.cost.incidentSpend,
    complexity: postmortem.architecture.final.complexityScore,
    peakP99: postmortem.impact.peakP99Latency,
    availability: postmortem.impact.availability,
    decisions: postmortem.decisions.map((record) => `${record.title} (T+${String(record.timestamp).padStart(2, '0')})`),
  }
}

/** Plays timed steps to the end of the incident. */
export function playSteps(steps: readonly PlaybookStep[], scenario: Scenario = SCENARIO): Simulation {
  const simulation = replay(scenario, playbookActions(steps, scenario))
  if (!simulation.isComplete()) simulation.runToCompletion()
  return simulation
}

/** The operator's accepted decisions as timed steps, the shape playbooks use. */
export function stepsOf(simulation: Simulation): PlaybookStep[] {
  return simulation.getHistory().decisions.map((record) => ({ at: record.timestamp, decision: record.decisionId, rationale: record.rationale }))
}

export interface Counterfactual {
  /** Index into the operator's accepted decisions. */
  index: number
  /** Decision to take instead, or `null` to take no action at that moment. */
  replacement: string | null
}

/**
 * "What if I had done something else at T+08?" Replays the operator's own
 * decisions at their own times with one of them swapped, then lets the
 * incident run out. Decisions later in the run that no longer apply are
 * rejected by the engine, exactly as they would have been live.
 */
export function counterfactual(simulation: Simulation, change: Counterfactual, scenario: Scenario = SCENARIO): Simulation {
  const steps = stepsOf(simulation)
  const original = steps[change.index]
  if (!original) throw new Error(`No decision at index ${change.index}`)
  const replaced =
    change.replacement === null
      ? steps.filter((_, index) => index !== change.index)
      : steps.map((step, index) => (index === change.index ? { at: step.at, decision: change.replacement as string, rationale: 'Counterfactual' } : step))
  return playSteps(replaced, scenario)
}

/** Runs every reference playbook. Deterministic, so safe to cache. */
export function playbookRuns(scenario: Scenario = SCENARIO): { playbook: Playbook; summary: RunSummary }[] {
  return PLAYBOOKS.map((playbook) => ({ playbook, summary: summarize(playbook.name, playSteps(playbook.steps, scenario)) }))
}

/**
 * Replays recorded actions on a fresh simulation and checks the outcome is
 * identical, field for field. This is the engine's determinism promise,
 * checked on the operator's real run.
 */
export function verifyReplay(simulation: Simulation, scenario: Scenario = SCENARIO): { identical: boolean; actions: SimulationAction[] } {
  const actions = simulation.getHistory().actions
  const again = replay(scenario, actions)
  return { identical: JSON.stringify(again.getResult()) === JSON.stringify(simulation.getResult()), actions }
}

export interface SignalGroups {
  worked: LearningSignal[]
  hurt: LearningSignal[]
  noted: LearningSignal[]
}

export function groupSignals(signals: readonly LearningSignal[]): SignalGroups {
  return {
    worked: signals.filter((signal) => signal.assessment === 'strength'),
    hurt: signals.filter((signal) => signal.assessment === 'weakness'),
    noted: signals.filter((signal) => signal.assessment === 'neutral'),
  }
}

export interface TradeOff {
  playbook: string
  summary: string
  /** Plain statements built from the numbers: "$410/month cheaper", "9 fewer minutes breaching SLOs". */
  better: string[]
  worse: string[]
}

/**
 * Trade-offs against the reference playbooks: for each one, where it did
 * better and worse than the operator, on the measured dimensions only.
 */
export function tradeOffs(mine: RunSummary, runs: { playbook: Playbook; summary: RunSummary }[]): TradeOff[] {
  return runs.map(({ playbook, summary }) => {
    const better: string[] = []
    const worse: string[] = []
    const compare = (delta: number, threshold: number, betterText: string, worseText: string) => {
      if (delta < -threshold) better.push(betterText)
      else if (delta > threshold) worse.push(worseText)
    }
    const slo = summary.sloViolationMinutes - mine.sloViolationMinutes
    compare(slo, 0, `${-slo} fewer minutes breaching SLOs`, `${slo} more minutes breaching SLOs`)
    const cost = summary.finalMonthlyCost - mine.finalMonthlyCost
    compare(cost, 1, `$${Math.round(-cost).toLocaleString('en-US')}/month cheaper to run afterwards`, `$${Math.round(cost).toLocaleString('en-US')}/month more expensive to run afterwards`)
    const impact = summary.businessImpact - mine.businessImpact
    compare(impact, 1, `$${Math.round(-impact).toLocaleString('en-US')} less business impact`, `$${Math.round(impact).toLocaleString('en-US')} more business impact`)
    const complexity = summary.complexity - mine.complexity
    compare(complexity, 0, `${-complexity} fewer points of complexity`, `${complexity} more points of complexity`)
    return { playbook: playbook.name, summary: playbook.summary, better, worse }
  })
}
