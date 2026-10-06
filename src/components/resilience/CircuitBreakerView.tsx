import { m } from 'framer-motion'
import { cn } from '@/lib/cn'
import {
  ARRIVAL_GAP_MS,
  DEPENDENCIES,
  SERVICE_LABELS,
  type BreakerState,
  type ResilienceConfig,
  type ResilienceState,
} from '@/lib/simulation/resilience'

const STATES: Array<{ id: BreakerState; label: string; tone: string }> = [
  { id: 'closed', label: 'CLOSED', tone: 'text-healthy' },
  { id: 'open', label: 'OPEN', tone: 'text-failed' },
  { id: 'half-open', label: 'HALF OPEN', tone: 'text-degraded' },
]

const highlight: Record<BreakerState, string> = {
  closed: 'bg-healthy/15 ring-healthy/50',
  open: 'bg-failed/15 ring-failed/50',
  'half-open': 'bg-degraded/15 ring-degraded/50',
}

/** The breaker state machine for each dependency, with what moves it next. */
export function CircuitBreakerView({ config, sim }: { config: ResilienceConfig; sim: ResilienceState }) {
  return (
    <div className="space-y-3" aria-live="polite">
      {DEPENDENCIES.map((dep) => {
        const b = sim.breakers[dep]
        const remaining = Math.max(0, config.recoveryMs - (sim.clock - b.openedAt))
        let note: string
        if (b.state === 'closed') note = `${b.consecutiveFailures} of ${config.failureThreshold} failures before it opens`
        else if (b.state === 'open')
          note = `Failing fast. Half open in ${(remaining / 1000).toFixed(1)} s (≈ ${Math.ceil(remaining / ARRIVAL_GAP_MS)} requests)`
        else note = 'Next call is a trial: success closes, failure re-opens'
        return (
          <div key={dep}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-fg">{SERVICE_LABELS[dep]}</span>
              <span className="sr-only">circuit {b.state}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-surface-2 p-0.5" aria-hidden="true">
              {STATES.map((s) => {
                const active = b.state === s.id
                return (
                  <span key={s.id} className="relative rounded px-1 py-1 text-center font-mono text-[10px] font-medium">
                    {active && (
                      <m.span
                        layoutId={`breaker-${dep}`}
                        className={cn('absolute inset-0 rounded ring-1', highlight[s.id])}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className={cn('relative', active ? s.tone : 'text-fg-subtle')}>{s.label}</span>
                  </span>
                )
              })}
            </div>
            <p className="mt-1 font-mono text-[10.5px] text-fg-subtle">{note}</p>
          </div>
        )
      })}
    </div>
  )
}
