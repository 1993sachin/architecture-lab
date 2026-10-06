import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pause, Play, RotateCcw, Send, SendHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  DEPENDENCIES,
  deriveTopology,
  describeTopology,
  explain,
  parseResilienceParams,
  serializeResilienceParams,
  summarizeMetrics,
  type BreakerState,
  type RequestBadge,
} from '@/lib/simulation/resilience'
import { useResilienceStore, useVisibleSim } from '@/store/resilienceStore'
import { useRequestPlayback } from '@/hooks/useRequestPlayback'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ArchitectureCanvas } from '@/components/architecture/ArchitectureCanvas'
import { DiagramLegend } from '@/components/architecture/DiagramLegend'
import { ExperimentHeader } from '@/components/experiment/ExperimentHeader'
import { ExplanationPanel } from '@/components/experiment/ExplanationPanel'
import { MetricsPanel, type Metric, type MetricTone } from '@/components/metrics/MetricsPanel'
import { buildDiagram } from '@/components/resilience/diagram'
import { FailureInjectionPanel } from '@/components/resilience/FailureInjectionPanel'
import { MechanismsPanel } from '@/components/resilience/MechanismsPanel'
import { RequestTimeline } from '@/components/resilience/RequestTimeline'
import { ScenarioPanel } from '@/components/resilience/ScenarioPanel'
import { TradeoffGrid } from '@/components/resilience/TradeoffGrid'
import { LESSONS } from '@/components/resilience/tradeoffs'

const BADGE_TONE: Record<RequestBadge, string> = {
  'IN FLIGHT': 'border-accent/40 bg-accent-soft text-accent',
  RETRYING: 'border-warning/40 bg-warning/10 text-warning',
  SUCCESS: 'border-healthy/40 bg-healthy/10 text-healthy',
  ACCEPTED: 'border-info/40 bg-info/10 text-info',
  FAILED: 'border-failed/40 bg-failed/10 text-failed',
  TIMEOUT: 'border-failed/40 bg-failed/10 text-failed',
  'CIRCUIT OPEN': 'border-warning/50 bg-warning/10 text-warning',
}

const FINAL_BADGE = {
  success: 'SUCCESS',
  accepted: 'ACCEPTED',
  failed: 'FAILED',
  timeout: 'TIMEOUT',
  'circuit-open': 'CIRCUIT OPEN',
} as const satisfies Record<string, RequestBadge>

const BREAKER_RANK: Record<BreakerState, number> = { closed: 0, 'half-open': 1, open: 2 }
const BREAKER_TEXT: Record<BreakerState, string> = { closed: 'CLOSED', open: 'OPEN', 'half-open': 'HALF OPEN' }

function availabilityTone(a: number, total: number): MetricTone {
  if (total === 0 || a >= 0.99) return 'healthy'
  if (a >= 0.9) return 'degraded'
  return 'failed'
}

export default function ResiliencePlayground() {
  useDocumentTitle('Resilience Playground')
  const config = useResilienceStore((s) => s.config)
  const sim = useVisibleSim()
  const trace = useResilienceStore((s) => s.sim.lastTrace)
  const scenarioId = useResilienceStore((s) => s.scenarioId)
  const lastAction = useResilienceStore((s) => s.lastAction)
  const pending = useResilienceStore((s) => s.pending)
  const autoTraffic = useResilienceStore((s) => s.autoTraffic)
  const queueRequests = useResilienceStore((s) => s.queueRequests)
  const toggleKill = useResilienceStore((s) => s.toggleKill)
  const toggleAutoTraffic = useResilienceStore((s) => s.toggleAutoTraffic)
  const loadScenario = useResilienceStore((s) => s.loadScenario)
  const resetScenario = useResilienceStore((s) => s.resetScenario)
  const reset = useResilienceStore((s) => s.reset)
  const clearTimeline = useResilienceStore((s) => s.clearTimeline)
  const playback = useRequestPlayback()

  // Shareable state: a link with parameters configures the run; later changes keep the URL current.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.size > 0) useResilienceStore.getState().hydrate(parseResilienceParams(searchParams))
    // Only on arrival: the effect below owns the URL afterwards.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const { scenarioId: id, config: current } = useResilienceStore.getState()
    const next = serializeResilienceParams({ scenarioId: id, config: current })
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [config, scenarioId, searchParams, setSearchParams])

  const compact = useMediaQuery('(max-width: 639px)')
  const layout = compact ? 'compact' : 'wide'
  const topology = useMemo(() => deriveTopology(config, sim), [config, sim])
  const onToggleKill = useCallback((id: Parameters<typeof toggleKill>[0]) => toggleKill(id), [toggleKill])
  const { nodes, edges } = useMemo(
    () =>
      buildDiagram({
        config,
        sim,
        topology,
        step: playback.step,
        stepKey: playback.stepKey,
        stepSeconds: playback.stepSeconds,
        onToggleKill,
        layout,
      }),
    [config, sim, topology, playback.step, playback.stepKey, playback.stepSeconds, onToggleKill, layout],
  )
  const explanation = useMemo(() => explain(config, sim, lastAction), [config, sim, lastAction])
  const summary = useMemo(() => summarizeMetrics(sim), [sim])

  const metricTiles = useMemo<Metric[]>(() => {
    const recent = sim.recent
    const worst = DEPENDENCIES.map((d) => sim.breakers[d].state).reduce<BreakerState>(
      (a, b) => (BREAKER_RANK[b] > BREAKER_RANK[a] ? b : a),
      'closed',
    )
    return [
      { label: 'Requests', value: summary.totalRequests.toLocaleString(), hint: 'total sent' },
      {
        label: 'Success',
        value: summary.successfulRequests.toLocaleString(),
        hint: config.queueEnabled ? 'incl. accepted (queued)' : 'successful requests',
        tone: summary.successfulRequests ? 'healthy' : 'neutral',
      },
      {
        label: 'Failure',
        value: summary.failedRequests.toLocaleString(),
        hint: summary.timeouts
          ? `${summary.timeouts} timeouts · ${summary.circuitRejections} fast-failed`
          : `${summary.circuitRejections} fast-failed`,
        tone: summary.failedRequests ? 'failed' : 'neutral',
        series: recent.map((r) => (r.ok ? 0 : 1)),
        seriesDomain: [0, 1],
      },
      {
        label: 'Availability',
        value: summary.totalRequests ? (summary.availability * 100).toFixed(2) : '100.00',
        unit: '%',
        hint: 'success ÷ requests',
        tone: availabilityTone(summary.availability, summary.totalRequests),
      },
      {
        label: 'Latency',
        value: Math.round(summary.averageLatency).toString(),
        unit: 'ms',
        hint: sim.lastTrace ? `last ${sim.lastTrace.latency} ms` : 'average',
        tone: summary.averageLatency >= 1000 ? 'failed' : summary.averageLatency >= 400 ? 'degraded' : 'neutral',
        series: recent.map((r) => r.latency),
        seriesDomain: [0, Math.max(400, ...recent.map((r) => r.latency))],
      },
      {
        label: 'Retries',
        value: summary.retryCount.toLocaleString(),
        hint: summary.totalRequests ? `${summary.paymentAmplification.toFixed(2)} payment calls / request` : 'retry attempts',
        tone: summary.retryCount ? 'degraded' : 'neutral',
      },
      {
        label: 'Cache hit rate',
        value: config.cacheEnabled || summary.cacheLookups ? Math.round(summary.cacheHitRate * 100).toString() : '–',
        unit: config.cacheEnabled || summary.cacheLookups ? '%' : undefined,
        hint: config.cacheEnabled ? `${sim.metrics.cacheHits} hits · ${sim.metrics.cacheMisses} misses` : 'cache off',
        tone: config.cacheEnabled && summary.cacheHitRate > 0 ? 'healthy' : 'neutral',
      },
      {
        label: 'Circuit',
        value: config.circuitBreakerEnabled ? BREAKER_TEXT[worst] : 'OFF',
        hint: config.circuitBreakerEnabled
          ? `pay ${BREAKER_TEXT[sim.breakers.payment.state].toLowerCase()} · inv ${BREAKER_TEXT[sim.breakers.inventory.state].toLowerCase()}`
          : 'breaker disabled',
        tone: !config.circuitBreakerEnabled
          ? 'neutral'
          : worst === 'open'
            ? 'failed'
            : worst === 'half-open'
              ? 'degraded'
              : 'healthy',
      },
    ]
  }, [sim, summary, config])

  const badge: RequestBadge | null = playback.step ? playback.step.badge : trace ? FINAL_BADGE[trace.status] : null
  const busy = playback.playing || pending > 0

  return (
    <div className="container-page max-w-7xl py-8 sm:py-10">
      <ExperimentHeader
        eyebrow="Experiment 02"
        title="Resilience Playground"
        description={
          <p>
            An order goes from the client through the API Gateway to the Order Service, which calls Payment and Inventory.{' '}
            <strong className="font-medium text-fg">Break it</strong>, switch on resilience mechanisms, send requests and watch
            what each one changes.
          </p>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" aria-hidden="true" /> Reset Simulation
          </Button>
        }
      />

      <div className="mt-6">
        <ScenarioPanel active={scenarioId} onSelect={loadScenario} onReset={resetScenario} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_auto_1fr]">
        <MetricsPanel metrics={metricTiles} columns={4} className="min-w-0 xl:col-start-1 xl:row-start-1" />

        <Card className="min-w-0 overflow-hidden xl:col-start-1 xl:row-start-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-[13px] font-semibold text-fg">Order system</h2>
              <StatusBadge status={topology.nodes.client} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => queueRequests(1)}>
                <Send className="size-3.5" aria-hidden="true" /> Send Request
              </Button>
              <Button variant="secondary" size="sm" onClick={() => queueRequests(10)} title="Send 10 requests, one after another">
                <SendHorizontal className="size-3.5" aria-hidden="true" /> Send 10
              </Button>
              <Button variant="secondary" size="sm" onClick={toggleAutoTraffic} aria-pressed={autoTraffic}>
                {autoTraffic ? (
                  <Pause className="size-3.5" aria-hidden="true" />
                ) : (
                  <Play className="size-3.5" aria-hidden="true" />
                )}
                {autoTraffic ? 'Stop traffic' : 'Auto traffic'}
              </Button>
            </div>
          </div>

          {/* What the current (or last) request is doing. */}
          <div
            className="flex min-h-[38px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface-2/50 px-4 py-2 text-xs"
            aria-live="polite"
          >
            {trace && badge ? (
              <>
                <span className="font-mono text-fg-subtle">Request #{trace.requestId}</span>
                <span className={cn('rounded border px-1.5 py-px font-mono text-[10.5px] font-semibold', BADGE_TONE[badge])}>
                  {badge}
                </span>
                <span className="min-w-0 text-fg-muted">
                  {playback.step
                    ? playback.step.label
                    : `${trace.latency} ms${trace.retries ? ` · ${trace.retries} retries` : ''}${trace.cache ? ` · cache ${trace.cache}` : ''}`}
                </span>
                {pending > 0 && <span className="ml-auto font-mono text-[11px] text-fg-subtle">{pending} more queued</span>}
              </>
            ) : (
              <span className="text-fg-subtle">Press Send Request to watch an order travel through the system.</span>
            )}
          </div>

          <ArchitectureCanvas
            key={layout}
            nodes={nodes}
            edges={edges}
            description={describeTopology(topology, config)}
            className={cn('bg-grid h-[600px] sm:h-[620px]', busy && 'cursor-progress')}
            fitPadding={compact ? 0.08 : 0.06}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-2.5">
            <DiagramLegend
              statuses={['healthy', 'degraded', 'failed', 'recovering', 'circuit-open']}
              flows={['failed', 'retry', 'queued']}
            />
            <p className="text-[11.5px] text-fg-subtle">
              Press <span className="font-medium text-fg">Kill</span> on a service to take it down
            </p>
          </div>
        </Card>

        <aside className="grid content-start gap-4 xl:col-start-2 xl:row-span-3 xl:row-start-1" aria-label="Experiment controls">
          <FailureInjectionPanel />
          <MechanismsPanel />
        </aside>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:col-start-1 xl:row-start-3">
          <ExplanationPanel
            title="What Just Happened?"
            tone={explanation.tone}
            headline={explanation.headline}
            details={explanation.details}
            change={explanation.tradeoff}
          />
          <RequestTimeline events={sim.timeline} onClear={clearTimeline} />
        </div>
      </div>

      <div className="mt-4">
        <TradeoffGrid config={config} />
      </div>

      <section className="mt-10" aria-labelledby="teaches-heading">
        <h2 id="teaches-heading" className="text-lg font-semibold tracking-tight text-fg">
          What This Experiment Teaches
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {LESSONS.map((l) => (
            <div key={l.title}>
              <dt className="text-[13px] font-medium text-fg">{l.title}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-fg-muted">{l.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
