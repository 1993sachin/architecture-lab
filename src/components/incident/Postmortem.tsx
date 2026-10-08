import { useMemo, useState } from 'react'
import { Brain, Circle, CheckCircle2, MinusCircle, Play, RotateCcw, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react'
import type { Postmortem as EngineReport, Scenario, Simulation } from '@architecture-lab/engine'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { clock, count, ms, percent, usd } from '@/lib/incident/format'
import { snapshotTopology } from '@/lib/incident/session'
import { counterfactual, groupSignals, playbookRuns, summarize, tradeOffs, type RunSummary } from '@/lib/incident/review'
import { decisionGuide } from '@/lib/incident/explain'
import type { GuidanceUse } from '@/lib/incident/guidance/context'
import { explainAlternative, reflect } from '@/lib/incident/guidance/reflection'
import { Eyebrow } from './shared'
import { StoryChart } from './StoryChart'
import { TopologyView } from './TopologyView'

const OUTCOME: Record<EngineReport['summary']['outcome'], { label: string; className: string; icon: typeof CheckCircle2 }> = {
  success: { label: 'STABILIZED', className: 'border-healthy/50 bg-healthy/10 text-healthy', icon: CheckCircle2 },
  partial: { label: 'PARTIAL SUCCESS', className: 'border-warning/50 bg-warning/10 text-warning', icon: MinusCircle },
  failure: { label: 'INCIDENT NOT CONTAINED', className: 'border-failed/50 bg-failed/10 text-failed', icon: XCircle },
}

interface PostmortemProps {
  scenario: Scenario
  simulation: Simulation
  /** Help the operator asked for. Reported, never scored. */
  used?: GuidanceUse
  onRunAgain: () => void
  onReplay: () => void
}

/** The structured postmortem the engine produced, rendered. Nothing here is written by a model. */
const NO_HELP: GuidanceUse = { hints: 0, strongHints: 0, rescues: 0, reasoningFlows: 0, explanations: 0 }

export function Postmortem({ scenario, simulation, used = NO_HELP, onRunAgain, onReplay }: PostmortemProps) {
  const report = simulation.getPostmortem()
  const reflection = useMemo(() => reflect(simulation.getPostmortem(), scenario, used), [simulation, scenario, used])
  const mine = useMemo(() => summarize('Your run', simulation), [simulation])
  const playbooks = useMemo(() => playbookRuns(scenario), [scenario])
  const outcome =
    report.summary.outcome === 'failure' && report.summary.stabilizedAt !== null
      ? { ...OUTCOME.failure, label: 'RECOVERED, OBJECTIVES MISSED' }
      : OUTCOME[report.summary.outcome]
  const OutcomeIcon = outcome.icon
  const { summary, impact, cost } = report
  const budget = scenario.initialState.constraints.find((constraint) => constraint.kind === 'budget')
  const finalBudget = [...report.constraints.timeline].reverse().find((entry) => entry.constraint.kind === 'budget')?.constraint
  const finalLimit = finalBudget && 'limit' in finalBudget ? finalBudget.limit : budget && 'limit' in budget ? budget.limit : null
  const markers = [
    ...report.decisions.map((record) => ({ time: record.timestamp, label: record.title, kind: 'decision' as const })),
    ...report.events.map((event) => ({ time: event.time, label: event.title, kind: 'event' as const })),
  ]
  const slo = (metric: string) => {
    const constraint = scenario.initialState.constraints.find((candidate) => candidate.kind === 'metric' && candidate.metric === metric)
    return constraint && 'limit' in constraint ? constraint.limit : undefined
  }
  const latencySlo = slo('p99Latency')
  const availabilitySlo = slo('availability')
  const samples = report.timeline
  const series = (pick: (sample: (typeof samples)[number]) => number) => samples.map((sample) => ({ time: sample.time, value: pick(sample) }))

  return (
    <div className="space-y-6 py-2">
      <header className="rounded-lg border border-border bg-surface p-5">
        <Eyebrow>Postmortem · {report.scenario.title}</Eyebrow>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className={cn('inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-sm font-semibold tracking-wide', outcome.className)} data-testid="outcome">
            <OutcomeIcon className="size-4" aria-hidden="true" />
            {outcome.label}
          </span>
          <span className="text-sm text-fg-muted">
            Score <span className="font-mono font-semibold text-fg">{summary.score}</span>/100
          </span>
        </div>
        <p className="mt-3 text-[15px] text-fg" data-testid="stabilize-summary">
          {summary.timeToStabilize !== null && summary.incidentStartedAt !== null
            ? `SLOs breached at ${clock(summary.incidentStartedAt)} and held again from ${clock(summary.stabilizedAt as number)}: ${summary.timeToStabilize} minutes to stabilize.`
            : summary.incidentStartedAt === null
              ? 'SLOs were never breached.'
              : `SLOs breached at ${clock(summary.incidentStartedAt)} and were still breached when the incident window closed at ${clock(summary.duration)}.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onRunAgain}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Run again
          </Button>
          <Button onClick={onReplay}>
            <Play className="size-4" aria-hidden="true" />
            Replay decisions
          </Button>
        </div>
      </header>

      <Reasoning reflection={reflection} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Impact">
          <Stats
            items={[
              ['Failed requests', count(impact.failedRequests)],
              ['Throttled requests', count(impact.throttledRequests)],
              ['Minutes breaching SLOs', String(impact.sloViolationMinutes)],
              ['Business impact', usd(impact.businessImpact ?? 0)],
              ['Availability', percent(impact.availability, 2)],
              ['Peak p99', ms(impact.peakP99Latency)],
            ]}
          />
        </Section>
        <Section title="Cost">
          <Stats
            items={[
              ['Monthly cost before', usd(cost.initialMonthlyCost)],
              ['Monthly cost after', usd(cost.finalMonthlyCost)],
              ['Budget at the end', finalLimit === null ? '—' : usd(finalLimit)],
              ['Spent during incident', usd(cost.incidentSpend, 2)],
            ]}
          />
          {finalLimit !== null && (
            <p className={cn('mt-2 text-[13px]', cost.finalMonthlyCost > finalLimit ? 'text-failed' : 'text-healthy')}>
              {cost.finalMonthlyCost > finalLimit ? `Ended ${usd(cost.finalMonthlyCost - finalLimit)}/month over budget.` : `Ended ${usd(finalLimit - cost.finalMonthlyCost)}/month under budget.`}
            </p>
          )}
        </Section>
      </div>

      <Section title="Objectives" note="What the incident was judged on.">
        <ul className="space-y-1.5" aria-label="Objectives">
          {report.objectives.map((objective) => (
            <li key={objective.objectiveId} className="flex gap-2 text-[13px]">
              {objective.met ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-healthy" aria-label="Met" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-failed" aria-label="Missed" />}
              <span className="text-fg">
                {objective.description}
                {objective.evaluation === 'fractionOfTime' && <span className="font-mono text-xs text-fg-subtle"> · held {percent(objective.achieved, 0)} of the time</span>}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How it unfolded" note="Solid lines are your decisions; dashed lines are things that happened to you.">
        <div className="grid gap-3 sm:grid-cols-2">
          <StoryChart title="p99 latency" points={series((sample) => sample.metrics.p99Latency ?? 0)} maxTime={summary.duration} format={ms} threshold={latencySlo === undefined ? undefined : { value: latencySlo, label: `SLO ${ms(latencySlo)}` }} markers={markers} max={Math.min(5000, Math.max(...samples.map((sample) => sample.metrics.p99Latency ?? 0), (latencySlo ?? 0) * 1.2))} />
          <StoryChart title="Availability" points={series((sample) => sample.metrics.availability ?? 0)} maxTime={summary.duration} format={(value) => percent(value)} threshold={availabilitySlo === undefined ? undefined : { value: availabilitySlo, label: `SLO ${percent(availabilitySlo)}` }} markers={markers} min={0} max={1} showLowest />
          <StoryChart title="Traffic" points={series((sample) => sample.metrics.requestsPerSecond ?? 0)} maxTime={summary.duration} format={(value) => `${count(value)} rps`} markers={markers} />
          <StoryChart title="Monthly cost" points={series((sample) => sample.monthlyCost)} maxTime={summary.duration} format={(value) => usd(value)} threshold={finalLimit === null ? undefined : { value: finalLimit, label: `budget ${usd(finalLimit)}` }} markers={markers} />
        </div>
      </Section>

      <Section title="Your decisions">
        {report.decisions.length === 0 ? (
          <p className="text-[13px] text-fg-muted">You made no decisions. The system ran on its own.</p>
        ) : (
          <ol className="space-y-3" aria-label="Decision timeline">
            {report.decisions.map((record) => (
              <li key={record.sequence} className="flex gap-3">
                <span className="w-10 shrink-0 font-mono text-xs text-fg-subtle">{clock(record.timestamp)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{record.title}</p>
                  <p className="text-[13px] text-fg-muted italic">“{record.rationale}”</p>
                  <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
                    {record.costImpact.monthly !== 0 && `${record.costImpact.monthly > 0 ? '+' : '−'}${usd(Math.abs(record.costImpact.monthly))}/mo · `}
                    {record.complexityImpact !== 0 && `${record.complexityImpact > 0 ? '+' : ''}${record.complexityImpact} complexity · `}
                    knew {record.knowledge.length} signals{record.revealed.length > 0 && `, learned ${record.revealed.length} more`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {report.rejectedDecisions.length > 0 && (
          <p className="mt-3 text-[13px] text-fg-muted">{report.rejectedDecisions.length} attempted decisions were refused.</p>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopologyView topology={snapshotTopology(scenario, report.architecture.initial)} title={`Architecture at ${clock(report.architecture.initial.time)}`} />
        <TopologyView topology={snapshotTopology(scenario, report.architecture.final)} title={`Architecture at ${clock(report.architecture.final.time)}`} />
      </div>

      <Signals report={report} />

      <TradeOffs mine={mine} playbooks={playbooks} />

      <CounterfactualPanel scenario={scenario} simulation={simulation} mine={mine} />
    </div>
  )
}

function Reasoning({ reflection }: { reflection: ReturnType<typeof reflect> }) {
  const help = reflection.guidance.filter((entry) => entry.count > 0)
  return (
    <Section title="Your reasoning" note="What you did that good incident reasoning looks like. Not part of the score.">
      <p className="text-[15px] font-medium text-fg" data-testid="recovered">
        {reflection.recovered}
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <ul className="space-y-1.5" aria-label="Reasoning checks">
          {reflection.checks.map((check) => (
            <li key={check.id} className="flex gap-2 text-[13px]">
              {check.done ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-healthy" aria-label="Done" /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-label="Not this time" />}
              <span className={check.done ? 'text-fg' : 'text-fg-muted'}>{check.label}</span>
            </li>
          ))}
        </ul>
        <div>
          <Eyebrow>Guidance used</Eyebrow>
          {help.length === 0 ? (
            <p className="mt-1 text-[13px] text-fg-muted">None. You worked it out on your own.</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-[13px] text-fg" aria-label="Guidance used">
              {help.map((entry) => (
                <li key={entry.label}>
                  {entry.label}: <span className="font-mono">{entry.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11.5px] text-fg-subtle">Asking for help is part of incident response. It doesn’t change your score.</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2 rounded-md border-l-2 border-accent bg-accent-soft px-3 py-2 text-[13.5px] leading-relaxed text-fg" data-testid="learning">
        <Brain className="mt-1 size-3.5 shrink-0 text-accent" aria-hidden="true" />
        <p>
          <span className="font-semibold">Learning: </span>
          {reflection.learning}
        </p>
      </div>
    </Section>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {note && <p className="text-xs text-fg-subtle">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
          <dt className="text-[11px] text-fg-subtle">{label}</dt>
          <dd className="font-mono text-sm font-semibold text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Signals({ report }: { report: EngineReport }) {
  const groups = groupSignals(report.learningSignals)
  const columns = [
    { title: 'What worked', items: groups.worked, icon: ThumbsUp, className: 'text-healthy' },
    { title: 'What hurt', items: groups.hurt, icon: ThumbsDown, className: 'text-failed' },
    { title: 'Worth knowing', items: groups.noted, icon: MinusCircle, className: 'text-fg-subtle' },
  ]
  return (
    <Section title="Learning signals" note="Measured from your run, not opinions.">
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map(({ title, items, icon: Icon, className }) => (
          <div key={title} aria-label={title} role="group">
            <Eyebrow className={cn('flex items-center gap-1', className)}>
              <Icon className="size-3" aria-hidden="true" />
              {title}
            </Eyebrow>
            {items.length === 0 ? (
              <p className="mt-1 text-[13px] text-fg-subtle">Nothing here.</p>
            ) : (
              <ul className="mt-1 space-y-1.5">
                {items.map((signal) => (
                  <li key={signal.id} className="text-[13px] leading-snug text-fg">
                    {signal.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

function TradeOffs({ mine, playbooks }: { mine: RunSummary; playbooks: ReturnType<typeof playbookRuns> }) {
  const comparisons = tradeOffs(mine, playbooks)
  return (
    <Section title="Trade-offs" note="The same incident, replayed by the engine with five reference playbooks. None of them is the answer.">
      <CompareTable runs={[mine, ...playbooks.map((run) => run.summary)]} />
      <ul className="mt-4 space-y-2">
        {comparisons.map((comparison) => (
          <li key={comparison.playbook} className="text-[13px]">
            <span className="font-medium text-fg">{comparison.playbook}</span> <span className="text-fg-subtle">{comparison.summary}</span>
            <span className="block text-fg-muted">
              {comparison.better.length > 0 && <>Compared with you: <span className="text-healthy">{comparison.better.join(', ')}</span></>}
              {comparison.better.length > 0 && comparison.worse.length > 0 && '; but '}
              {comparison.better.length === 0 && comparison.worse.length > 0 && 'Compared with you: '}
              {comparison.worse.length > 0 && <span className="text-failed">{comparison.worse.join(', ')}</span>}
              {comparison.better.length === 0 && comparison.worse.length === 0 && 'About the same as your run.'}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function CompareTable({ runs }: { runs: RunSummary[] }) {
  const rows: [string, (run: RunSummary) => string][] = [
    ['Outcome', (run) => OUTCOME[run.outcome].label.toLowerCase()],
    ['Score', (run) => String(run.score)],
    ['Stabilized', (run) => (run.stabilizedAt === null ? 'no' : clock(run.stabilizedAt))],
    ['Minutes breaching SLOs', (run) => String(run.sloViolationMinutes)],
    ['Failed requests', (run) => count(run.failedRequests)],
    ['Throttled requests', (run) => count(run.throttledRequests)],
    ['Business impact', (run) => usd(run.businessImpact)],
    ['Monthly cost after', (run) => usd(run.finalMonthlyCost)],
    ['Complexity', (run) => String(run.complexity)],
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th className="py-1.5 pr-3 font-normal text-fg-subtle" />
            {runs.map((run) => (
              <th key={run.label} scope="col" className={cn('py-1.5 pr-3 font-medium', run.label === 'Your run' ? 'text-accent' : 'text-fg')}>
                {run.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, pick]) => (
            <tr key={label} className="border-b border-border/60">
              <th scope="row" className="py-1.5 pr-3 font-normal text-fg-muted">
                {label}
              </th>
              {runs.map((run) => (
                <td key={run.label} className="py-1.5 pr-3 font-mono text-fg">
                  {pick(run)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const NOTHING = '__nothing__'

function CounterfactualPanel({ scenario, simulation, mine }: { scenario: Scenario; simulation: Simulation; mine: RunSummary }) {
  const decisions = simulation.getHistory().decisions
  const [index, setIndex] = useState(0)
  const [replacement, setReplacement] = useState(NOTHING)
  const [result, setResult] = useState<RunSummary | null>(null)
  const [why, setWhy] = useState<string[]>([])
  if (decisions.length === 0) return null
  const chosen = decisions[index]
  const compare = () => {
    const alternative = counterfactual(simulation, { index, replacement: replacement === NOTHING ? null : replacement }, scenario)
    const definition = scenario.decisions.find((decision) => decision.id === replacement)
    const title = replacement === NOTHING ? 'nothing' : (definition?.title ?? replacement)
    setResult({ ...summarize(`Instead: ${title}`, alternative) })
    const guide = definition ? decisionGuide({ id: definition.id, kind: definition.reveals?.length ? 'investigate' : 'change', description: definition.description }, scenario.id) : null
    setWhy(explainAlternative(simulation, alternative, chosen?.timestamp ?? 0, definition && guide ? { title: definition.title, guide } : null))
  }
  return (
    <Section title="Compare with another decision" note="The engine replays your run with one decision swapped. Everything else stays the same, at the same times.">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-subtle">Instead of</span>
          <select
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-fg"
            value={index}
            onChange={(event) => {
              setIndex(Number(event.target.value))
              setResult(null)
            }}
          >
            {decisions.map((record, position) => (
              <option key={record.sequence} value={position}>
                {clock(record.timestamp)} {record.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-subtle">I would have</span>
          <select
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-fg"
            value={replacement}
            onChange={(event) => {
              setReplacement(event.target.value)
              setResult(null)
            }}
          >
            <option value={NOTHING}>done nothing</option>
            {scenario.decisions
              .filter((decision) => decision.id !== chosen?.decisionId)
              .map((decision) => (
                <option key={decision.id} value={decision.id}>
                  {decision.title.toLowerCase()}
                </option>
              ))}
          </select>
        </label>
        <Button onClick={compare}>Compare</Button>
      </div>
      {result && (
        <div className="mt-4" data-testid="counterfactual">
          <CompareTable runs={[mine, result]} />
          {why.length > 0 && (
            <ul className="mt-3 space-y-1 text-[13px] leading-snug text-fg" data-testid="counterfactual-why">
              {why.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}
