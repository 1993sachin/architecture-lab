import { summarizeMetrics } from '@/lib/simulation/resilience'
import { useResilienceStore, useVisibleSim } from '@/store/resilienceStore'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Switch } from '@/components/ui/Switch'
import { ControlPanel, ControlSection } from '@/components/experiment/ControlPanel'
import { CircuitBreakerView } from './CircuitBreakerView'
import { QueueView } from './QueueView'

/** Turn resilience patterns on and off, and tune them. */
export function MechanismsPanel({ className }: { className?: string }) {
  const config = useResilienceStore((s) => s.config)
  const sim = useVisibleSim()
  const setConfig = useResilienceStore((s) => s.setConfig)
  const summary = summarizeMetrics(sim)

  return (
    <ControlPanel title="Resilience Mechanisms" className={className}>
      <ControlSection title="Timeout">
        <SegmentedControl
          label="Order Service gives up after"
          options={[
            { value: '500', label: '500 ms' },
            { value: '1000', label: '1 s' },
            { value: '2000', label: '2 s' },
          ]}
          value={`${config.timeoutMs}`}
          onChange={(v) => setConfig({ timeoutMs: Number(v) }, { kind: 'timeout' })}
        />
      </ControlSection>

      <ControlSection title="Retry">
        <Switch
          label="Enable Retry"
          description="Retry failed calls with a short backoff."
          checked={config.retryEnabled}
          onChange={(v) => setConfig({ retryEnabled: v }, { kind: 'mechanism', mechanism: 'retry', enabled: v })}
        />
        {config.retryEnabled && (
          <SegmentedControl
            label="Max retries"
            options={[
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' },
            ]}
            value={`${config.maxRetries}`}
            onChange={(v) => setConfig({ maxRetries: Number(v) as 1 | 2 | 3 }, { kind: 'setting', key: 'maxRetries' })}
          />
        )}
      </ControlSection>

      <ControlSection title="Circuit breaker">
        <Switch
          label="Enable Circuit Breaker"
          description="Stop calling a dependency after repeated failures."
          checked={config.circuitBreakerEnabled}
          onChange={(v) =>
            setConfig({ circuitBreakerEnabled: v }, { kind: 'mechanism', mechanism: 'circuitBreaker', enabled: v })
          }
        />
        {config.circuitBreakerEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SegmentedControl
                label="Failure threshold"
                options={[
                  { value: '2', label: '2' },
                  { value: '3', label: '3' },
                  { value: '5', label: '5' },
                ]}
                value={`${config.failureThreshold}`}
                onChange={(v) => setConfig({ failureThreshold: Number(v) }, { kind: 'setting', key: 'failureThreshold' })}
              />
              <SegmentedControl
                label="Recovery time"
                options={[
                  { value: '2000', label: '2 s' },
                  { value: '5000', label: '5 s' },
                  { value: '10000', label: '10 s' },
                ]}
                value={`${config.recoveryMs}`}
                onChange={(v) => setConfig({ recoveryMs: Number(v) }, { kind: 'setting', key: 'recoveryMs' })}
              />
            </div>
            <CircuitBreakerView config={config} sim={sim} />
          </>
        )}
      </ControlSection>

      <ControlSection title="Cache">
        <Switch
          label="Enable Redis Cache"
          description="Cache stock levels so repeat products skip Inventory."
          checked={config.cacheEnabled}
          onChange={(v) => setConfig({ cacheEnabled: v }, { kind: 'mechanism', mechanism: 'cache', enabled: v })}
        />
        {config.cacheEnabled && (
          <p className="font-mono text-[11px] text-fg-subtle" aria-live="polite">
            {summary.cacheLookups === 0
              ? 'No lookups yet'
              : `${sim.metrics.cacheHits} hits · ${sim.metrics.cacheMisses} misses · ${Math.round(summary.cacheHitRate * 100)}% hit rate`}
            {sim.lastTrace?.cache && (
              <span className={sim.lastTrace.cache === 'hit' ? 'ml-2 text-info' : 'ml-2 text-fg-muted'}>
                last: Cache {sim.lastTrace.cache.toUpperCase()}
              </span>
            )}
          </p>
        )}
      </ControlSection>

      <ControlSection title="Asynchronous processing">
        <Switch
          label="Enable Message Queue"
          description="Accept the order now; charge and reserve stock in the background."
          checked={config.queueEnabled}
          onChange={(v) => setConfig({ queueEnabled: v }, { kind: 'mechanism', mechanism: 'queue', enabled: v })}
        />
        {config.queueEnabled && <QueueView sim={sim} />}
      </ControlSection>
    </ControlPanel>
  )
}
