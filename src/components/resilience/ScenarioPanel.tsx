import { CreditCard, Database, PackageSearch, RotateCcw, Wifi, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SCENARIOS, type ScenarioId } from '@/lib/simulation/resilience'
import { Button } from '@/components/ui/Button'

const ICONS: Record<ScenarioId, LucideIcon> = {
  'payment-outage': CreditCard,
  'inventory-slowdown': PackageSearch,
  'network-instability': Wifi,
  'database-failure': Database,
}

interface ScenarioPanelProps {
  active: ScenarioId | null
  onSelect: (id: ScenarioId) => void
  onReset: () => void
}

/** Predefined failures. Selecting one reconfigures the simulator and starts a fresh run. */
export function ScenarioPanel({ active, onSelect, onReset }: ScenarioPanelProps) {
  return (
    <section aria-labelledby="scenarios-heading">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="scenarios-heading" className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">
          Failure Scenarios
        </h2>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onReset}>
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset Scenario
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((s) => {
          const Icon = ICONS[s.id]
          const selected = active === s.id
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(s.id)}
              className={cn(
                'group flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                selected ? 'border-accent/60 bg-accent-soft' : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                <Icon
                  className={cn('size-3.5', selected ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted')}
                  aria-hidden="true"
                />
                {s.title}
                {selected && <span className="ml-auto font-mono text-[10px] font-medium text-accent">ACTIVE</span>}
              </span>
              <span className="text-xs leading-relaxed text-fg-muted">{s.description}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
