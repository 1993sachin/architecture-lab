import { Power, PowerOff, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SERVICE_LABELS, type KillableService, type NetworkLatency, type PacketLoss } from '@/lib/simulation/resilience'
import { useResilienceStore } from '@/store/resilienceStore'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ControlPanel, ControlSection } from '@/components/experiment/ControlPanel'

const SERVICES: KillableService[] = ['payment', 'inventory', 'order']

const LATENCY_OPTIONS: Array<{ value: `${NetworkLatency}`; label: string }> = [
  { value: '0', label: 'Normal' },
  { value: '100', label: '+100 ms' },
  { value: '500', label: '+500 ms' },
  { value: '1000', label: '+1 s' },
]
const LOSS_OPTIONS: Array<{ value: `${PacketLoss}`; label: string }> = [
  { value: '0', label: 'None' },
  { value: '0.1', label: 'Drop 10%' },
  { value: '0.5', label: 'Drop 50%' },
]

/** Break things: kill services and degrade the network. Changes apply immediately. */
export function FailureInjectionPanel({ className }: { className?: string }) {
  const config = useResilienceStore((s) => s.config)
  const toggleKill = useResilienceStore((s) => s.toggleKill)
  const restoreAll = useResilienceStore((s) => s.restoreAll)
  const setConfig = useResilienceStore((s) => s.setConfig)
  const anyFailure =
    config.killed.length > 0 || config.latencyMs > 0 || config.packetLoss > 0 || Object.values(config.slowdown).some(Boolean)

  return (
    <ControlPanel
      title="Failure Injection"
      className={cn('border-failed/30', className)}
      footer={
        <Button variant="secondary" size="sm" className="flex-1" onClick={restoreAll} disabled={!anyFailure}>
          <RotateCcw className="size-3.5" aria-hidden="true" /> Restore All Services
        </Button>
      }
    >
      <ControlSection title="Service failures">
        <div className="grid gap-2">
          {SERVICES.map((service) => {
            const down = config.killed.includes(service)
            return (
              <button
                key={service}
                type="button"
                aria-pressed={down}
                onClick={() => toggleKill(service)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-[13px] font-medium transition-colors',
                  down
                    ? 'border-failed/50 bg-failed/10 text-failed hover:bg-failed/15'
                    : 'border-border bg-surface text-fg hover:border-failed/40 hover:text-failed',
                )}
              >
                <span className="inline-flex items-center gap-2">
                  {down ? (
                    <PowerOff className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Power className="size-3.5" aria-hidden="true" />
                  )}
                  {down ? `${SERVICE_LABELS[service]} killed` : `Kill ${SERVICE_LABELS[service]}`}
                </span>
                <span className="font-mono text-[10.5px] text-fg-subtle">{down ? 'click to restore' : ''}</span>
              </button>
            )
          })}
          {config.killed.includes('paymentDb') && (
            <button
              type="button"
              aria-pressed
              onClick={() => toggleKill('paymentDb')}
              className="flex items-center justify-between gap-2 rounded-md border border-failed/50 bg-failed/10 px-3 py-2 text-left text-[13px] font-medium text-failed transition-colors hover:bg-failed/15"
            >
              <span className="inline-flex items-center gap-2">
                <PowerOff className="size-3.5" aria-hidden="true" /> Payment Database killed
              </span>
              <span className="font-mono text-[10.5px] text-fg-subtle">click to restore</span>
            </button>
          )}
        </div>
      </ControlSection>

      <ControlSection title="Network failures">
        <SegmentedControl
          label="Network latency"
          options={LATENCY_OPTIONS}
          value={`${config.latencyMs}`}
          onChange={(v) => setConfig({ latencyMs: Number(v) as NetworkLatency }, { kind: 'latency' })}
        />
        <SegmentedControl
          label="Packet loss"
          options={LOSS_OPTIONS}
          value={`${config.packetLoss}`}
          onChange={(v) => setConfig({ packetLoss: Number(v) as PacketLoss }, { kind: 'packetLoss' })}
        />
        {config.slowdown.inventory ? (
          <p className="rounded-md border border-degraded/30 bg-degraded/5 px-3 py-2 text-xs text-fg-muted">
            Inventory Service is slow: <span className="font-mono text-degraded">+{config.slowdown.inventory} ms</span> per call
            (scenario).
          </p>
        ) : null}
      </ControlSection>
    </ControlPanel>
  )
}
