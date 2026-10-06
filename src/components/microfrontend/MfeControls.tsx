import { Pause, Play, RotateCcw } from 'lucide-react'
import { MODULES, MODULE_LABELS, type ArchitectureMode, type FailureTarget } from '@/lib/simulation/microfrontend'
import { useMicrofrontendStore } from '@/store/microfrontendStore'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ControlPanel, ControlSection } from '@/components/experiment/ControlPanel'
import { FailureControl } from '@/components/experiment/FailureControl'

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
        <FailureControl<FailureTarget>
          label="Failure simulation: take a module offline"
          normalValue="none"
          value={config.failure}
          onChange={(v) => setControl('failure', v)}
          targets={MODULES.map((id) => ({ value: id, label: MODULE_LABELS[id] }))}
        />
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
          description={isMfe ? 'Each team releases its module on its own.' : 'Not possible in a monolith: everything ships as one unit.'}
          checked={config.independentDeployment}
          disabled={!isMfe}
          onChange={(v) => setControl('independentDeployment', v)}
        />
      </ControlSection>
    </ControlPanel>
  )
}
