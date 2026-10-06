import { CircleCheck, CircleSlash, Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { MODULES, MODULE_LABELS, type ArchitectureMode } from '@/lib/simulation/microfrontend'
import { useMicrofrontendStore } from '@/store/microfrontendStore'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ControlPanel, ControlSection } from '@/components/experiment/ControlPanel'

export function MfeControls({ className }: { className?: string }) {
  const config = useMicrofrontendStore((s) => s.config)
  const running = useMicrofrontendStore((s) => s.running)
  const setControl = useMicrofrontendStore((s) => s.setControl)
  const toggleRunning = useMicrofrontendStore((s) => s.toggleRunning)
  const reset = useMicrofrontendStore((s) => s.reset)
  const isMfe = config.mode === 'microfrontends'

  return (
    <ControlPanel
      className={className}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={toggleRunning} className="flex-1" aria-pressed={!running}>
            {running ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
            {running ? 'Pause' : 'Resume'}
          </Button>
          <Button variant="secondary" size="sm" onClick={reset} className="flex-1">
            <RotateCcw className="size-3.5" aria-hidden="true" /> Reset Experiment
          </Button>
        </>
      }
    >
      <ControlSection title="Architecture">
        <SegmentedControl<ArchitectureMode>
          label="Architecture mode"
          value={config.mode}
          onChange={(v) => setControl('mode', v)}
          options={[
            { value: 'monolith', label: 'Monolith' },
            { value: 'microfrontends', label: 'Microfrontends' },
          ]}
        />
        <ModuleFailures />
      </ControlSection>

      <ControlSection title="Network">
        <Slider
          label="Network latency"
          min={0}
          max={800}
          step={10}
          value={config.latencyMs}
          onChange={(v) => setControl('latencyMs', v)}
          format={(v) => `${v} ms`}
        />
        <Slider
          label="API failure probability"
          min={0}
          max={0.5}
          step={0.01}
          value={config.apiFailureRate}
          onChange={(v) => setControl('apiFailureRate', v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </ControlSection>

      <ControlSection title="Strategies">
        <Switch
          label="Enable caching"
          description="Serve repeat reads, and stale data when a dependency fails."
          checked={config.caching}
          onChange={(v) => setControl('caching', v)}
        />
        <Switch
          label="Lazy loading"
          description="Fetch a module only when it is visited."
          checked={config.lazyLoading}
          onChange={(v) => setControl('lazyLoading', v)}
        />
        <Switch
          label="Independent deployment"
          description={
            isMfe ? 'Each team releases its module on its own.' : 'Not possible in a monolith: everything ships as one unit.'
          }
          checked={config.independentDeployment}
          disabled={!isMfe}
          onChange={(v) => setControl('independentDeployment', v)}
        />
      </ControlSection>
    </ControlPanel>
  )
}

const cardClass = 'flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors'

/** Takes modules offline. Several can be down at once, so each is an independent toggle. */
function ModuleFailures() {
  const failures = useMicrofrontendStore((s) => s.config.failures)
  const toggleModule = useMicrofrontendStore((s) => s.toggleModule)
  const setControl = useMicrofrontendStore((s) => s.setControl)
  return (
    <div role="group" aria-labelledby="mfe-failures-label">
      <div id="mfe-failures-label" className="mb-1.5 text-xs font-medium text-fg-subtle">
        Failure simulation: take modules offline
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          aria-pressed={failures.length === 0}
          onClick={() => setControl('failures', [])}
          className={cn(
            cardClass,
            failures.length === 0
              ? 'border-fg-subtle bg-surface-2 text-fg'
              : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
          )}
        >
          <CircleCheck className="size-3.5 shrink-0 text-healthy" aria-hidden="true" />
          <span className="truncate">{failures.length ? 'Restore all' : 'All online'}</span>
        </button>
        {MODULES.map((id) => {
          const down = failures.includes(id)
          return (
            <button
              key={id}
              type="button"
              aria-pressed={down}
              aria-label={`${MODULE_LABELS[id]} offline`}
              data-guide-target={`mfe-module-${id}`}
              onClick={() => toggleModule(id)}
              className={cn(
                cardClass,
                down
                  ? 'border-failed/50 bg-failed/10 text-failed'
                  : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
              )}
            >
              <CircleSlash className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{MODULE_LABELS[id]}</span>
              <span className="ml-auto font-mono text-[10px] font-normal">{down ? 'off' : 'on'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
