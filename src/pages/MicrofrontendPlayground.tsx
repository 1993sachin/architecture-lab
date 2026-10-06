import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pause, Play, RotateCcw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { MFE_PRESETS, explainChange } from '@/lib/simulation/microfrontend'
import { useMicrofrontendStore } from '@/store/microfrontendStore'
import { useExperienceMode, useGuideRun, useGuideStore, type ExperienceMode } from '@/store/guideStore'
import { useMicrofrontendSimulation } from '@/hooks/useMicrofrontendSimulation'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DiagramLegend } from '@/components/architecture/DiagramLegend'
import { ArchitectureCanvas } from '@/components/architecture/ArchitectureCanvas'
import { ExperimentHeader } from '@/components/experiment/ExperimentHeader'
import { ExplanationPanel } from '@/components/experiment/ExplanationPanel'
import { TradeoffPanel } from '@/components/experiment/TradeoffPanel'
import { MetricsPanel, type Metric, type MetricTone } from '@/components/metrics/MetricsPanel'
import { RequestLog, type LogEntry } from '@/components/metrics/RequestLog'
import { MfeControls } from '@/components/microfrontend/MfeControls'
import { MfeUserView } from '@/components/microfrontend/MfeUserView'
import { buildDiagram, describeDiagram } from '@/components/microfrontend/diagram'
import { MFE_TRADEOFFS, MONOLITH_TRADEOFFS } from '@/components/microfrontend/tradeoffs'
import { MFE_GUIDE, MFE_HELP, MFE_IDEAS } from '@/components/microfrontend/guide'
import { ContextualHelp } from '@/components/guide/ContextualHelp'
import { GuidedExperiment } from '@/components/guide/GuidedExperiment'
import { ModeSwitch } from '@/components/guide/ModeSwitch'
import { TrySomething } from '@/components/guide/TrySomething'

function availabilityTone(a: number): MetricTone {
  if (a >= 0.99) return 'healthy'
  if (a >= 0.9) return 'degraded'
  return 'failed'
}

function latencyTone(ms: number): MetricTone {
  if (ms < 150) return 'healthy'
  if (ms < 400) return 'degraded'
  return 'failed'
}

export default function MicrofrontendPlayground() {
  useDocumentTitle('Microfrontend Playground')
  const { state, config, metrics, topology, explanation, running } = useMicrofrontendSimulation()
  const lastChange = useMicrofrontendStore((s) => s.lastChange)
  const applyPreset = useMicrofrontendStore((s) => s.applyPreset)
  const toggleRunning = useMicrofrontendStore((s) => s.toggleRunning)
  const reset = useMicrofrontendStore((s) => s.reset)

  const toggleModule = useMicrofrontendStore((s) => s.toggleModule)

  // Guided Mode by default on a first visit; Free Explore once the guide is done.
  const [mode, setMode] = useExperienceMode(MFE_GUIDE.id)
  const run = useGuideRun(MFE_GUIDE.id)
  const showGuide = mode === 'guided' || (run.done && !run.dismissed)
  const startGuide = useCallback(() => {
    useGuideStore.getState().start(MFE_GUIDE.id)
    reset()
  }, [reset])
  const changeMode = (next: ExperienceMode) => {
    if (next === 'guided' && run.done) startGuide()
    setMode(next)
  }
  // "Start Here" links with ?guide=start: always begin the walkthrough from step 1.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('guide') !== 'start') return
    startGuide()
    setParams({}, { replace: true })
  }, [params, setParams, startGuide])

  const compact = useMediaQuery('(max-width: 639px)')
  const layout = compact ? 'compact' : 'wide'
  const { nodes, edges } = useMemo(
    () => buildDiagram(config, metrics, topology, toggleModule, layout),
    [config, metrics, topology, toggleModule, layout],
  )

  const metricTiles = useMemo<Metric[]>(() => {
    const h = state.history
    const recentFailed = h.slice(-3).reduce((n, s) => n + s.failed, 0)
    return [
      {
        label: 'Requests',
        value: metrics.requests.toLocaleString(),
        hint: `${metrics.requestsPerSecond.toFixed(1)} req/s`,
      },
      {
        label: 'Successful',
        value: metrics.succeeded.toLocaleString(),
        hint: state.totals.cached ? `${state.totals.cached.toLocaleString()} from stale cache` : 'all fresh',
        tone: 'healthy',
        series: h.map((s) => s.succeeded),
        seriesDomain: [0, 8],
      },
      {
        label: 'Failed',
        value: metrics.failed.toLocaleString(),
        hint: `${recentFailed} in the last 3 ticks`,
        tone: recentFailed > 0 ? 'failed' : 'neutral',
        series: h.map((s) => s.failed),
        seriesDomain: [0, 8],
      },
      {
        label: 'Latency',
        value: Math.round(metrics.latency).toString(),
        unit: 'ms',
        hint: `p95 ${Math.round(metrics.p95Latency)} ms`,
        tone: latencyTone(metrics.latency),
        series: h.map((s) => s.avgLatency),
        seriesDomain: [0, Math.max(400, ...h.map((s) => s.avgLatency))],
      },
      {
        label: 'Availability',
        value: (metrics.availability * 100).toFixed(1),
        unit: '%',
        hint: 'last 6 ticks',
        tone: availabilityTone(metrics.availability),
        series: h.map((s) => s.succeeded / s.requests),
        seriesDomain: [0, 1],
      },
    ]
  }, [state, metrics])

  const logEntries = useMemo<LogEntry[]>(
    () =>
      state.log.slice(0, 9).map((r) => ({
        id: r.id,
        path: `/${r.module}`,
        status: r.status,
        latency: r.latency,
        note: r.note,
        outcome: r.outcome,
      })),
    [state.log],
  )

  const isMfe = config.mode === 'microfrontends'
  const tradeoffs = isMfe ? MFE_TRADEOFFS : MONOLITH_TRADEOFFS

  return (
    <div className="container-page max-w-7xl py-8 sm:py-10">
      <ExperimentHeader
        eyebrow="Experiment 01"
        difficulty="Beginner"
        title="Microfrontend Playground"
        description={
          <p>
            An application shell composes three modules owned by three teams. Break a module, change the network or flip a
            strategy, and watch how far the failure spreads in a <strong className="font-medium text-fg">monolith</strong> versus{' '}
            <strong className="font-medium text-fg">microfrontends</strong>.
          </p>
        }
        actions={
          <>
            <ModeSwitch mode={showGuide ? 'guided' : 'free'} onChange={changeMode} />
            <ContextualHelp content={MFE_HELP} />
            <Button variant="secondary" size="sm" onClick={toggleRunning} aria-pressed={!running}>
              {running ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
              {running ? 'Pause' : 'Resume'}
            </Button>
            <Button variant="secondary" size="sm" onClick={reset}>
              <RotateCcw className="size-3.5" aria-hidden="true" /> Reset
            </Button>
          </>
        }
      >
        {!showGuide && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <TrySomething ideas={MFE_IDEAS} className="w-full" />
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
              <Sparkles className="size-3.5 text-accent" aria-hidden="true" /> Try this:
            </span>
            {MFE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.config)}
                title={preset.description}
                className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </ExperimentHeader>

      {showGuide && <GuidedExperiment guide={MFE_GUIDE} state={{ config }} onStart={reset} className="mt-6" />}

      {/* Below xl the controls sit right under the canvas, so they stay close to what they change. */}
      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <MetricsPanel metrics={metricTiles} className="min-w-0 xl:col-start-1 xl:row-start-1" />

        <Card className="min-w-0 overflow-hidden xl:col-start-1 xl:row-start-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-fg">
                {isMfe ? 'Microfrontend architecture' : 'Monolithic architecture'}
              </h2>
              <StatusBadge status={topology.shell} />
            </div>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle">
              <span
                className={cn('size-1.5 rounded-full', running ? 'animate-pulse bg-accent' : 'bg-fg-subtle')}
                aria-hidden="true"
              />
              {running ? `live · tick ${state.tick}` : `paused · tick ${state.tick}`}
            </span>
          </div>
          <ArchitectureCanvas
            key={layout}
            nodes={nodes}
            edges={edges}
            description={describeDiagram(config, topology)}
            className="bg-grid h-[560px] sm:h-[500px]"
            fitPadding={compact ? 0.22 : 0.12}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-2.5">
            <DiagramLegend />
            <p className="text-[11.5px] text-fg-subtle">
              Press <span className="font-medium text-fg">Kill</span> on a module to take it offline
            </p>
          </div>
        </Card>

        <aside
          className="xl:sticky xl:top-20 xl:col-start-2 xl:row-span-3 xl:row-start-1 xl:self-start"
          aria-label="Experiment controls"
        >
          <MfeControls />
        </aside>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:col-start-1 xl:row-start-3">
          <ExplanationPanel
            tone={explanation.tone}
            headline={explanation.headline}
            details={explanation.details}
            change={lastChange ? explainChange(lastChange, config) : null}
          />
          <MfeUserView config={config} metrics={metrics} topology={topology} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TradeoffPanel
          title={isMfe ? 'Trade-offs: microfrontends' : 'Trade-offs: monolith'}
          description="No architecture is free. This is what the current mode buys you, and what it costs."
          advantages={tradeoffs.advantages}
          costs={tradeoffs.costs}
        />
        <RequestLog entries={logEntries} />
      </div>
    </div>
  )
}
