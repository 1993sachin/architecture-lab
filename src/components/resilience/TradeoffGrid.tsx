import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ResilienceConfig } from '@/lib/simulation/resilience'
import { Card } from '@/components/ui/Card'
import { MECHANISMS } from './tradeoffs'

const enabled = (config: ResilienceConfig) => ({
  retry: config.retryEnabled,
  circuitBreaker: config.circuitBreakerEnabled,
  cache: config.cacheEnabled,
  queue: config.queueEnabled,
})

/** Benefit and cost of each mechanism; the ones in use are highlighted. */
export function TradeoffGrid({ config }: { config: ResilienceConfig }) {
  const on = enabled(config)
  const active = MECHANISMS.filter((m) => on[m.id]).length
  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-fg">Architecture Trade-offs</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">
          {active === 0
            ? 'No mechanism is on. Every resilience pattern buys something and costs something.'
            : `${active} ${active === 1 ? 'mechanism is' : 'mechanisms are'} on. This is what you are paying for them.`}
        </p>
      </div>
      <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {MECHANISMS.map((m) => (
          <li key={m.id} className={cn('bg-surface p-4 transition-opacity', !on[m.id] && 'opacity-60')}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-medium text-fg">{m.title}</h3>
              <span
                className={cn(
                  'rounded border px-1.5 py-px font-mono text-[10px]',
                  on[m.id] ? 'border-accent/40 bg-accent-soft text-accent' : 'border-border text-fg-subtle',
                )}
              >
                {on[m.id] ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
            <p className="mt-3 flex gap-2 text-[12.5px] leading-relaxed text-fg-muted">
              <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded bg-healthy/10 text-healthy">
                <Plus className="size-3" aria-label="Benefit" />
              </span>
              {m.benefit}
            </p>
            <p className="mt-2 flex gap-2 text-[12.5px] leading-relaxed text-fg-muted">
              <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded bg-degraded/10 text-degraded">
                <Minus className="size-3" aria-label="Cost" />
              </span>
              {m.cost}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
