import { Gauge, Hammer, Lightbulb, Zap, type LucideIcon } from 'lucide-react'

const steps: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Hammer, title: 'Build', body: 'Assemble a system from real building blocks: gateways, services, caches, queues.' },
  { icon: Zap, title: 'Break', body: 'Kill a service, add latency, drop requests. Find out what fails and what survives.' },
  { icon: Gauge, title: 'Measure', body: 'Watch success rate, latency and availability respond to every decision you make.' },
  { icon: Lightbulb, title: 'Understand', body: 'Read why it happened and what the trade-off costs, in plain engineering terms.' },
]

export function LoopSteps() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, i) => {
        const Icon = step.icon
        return (
          <li key={step.title} className="relative bg-surface p-5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-fg-subtle">0{i + 1}</span>
              <Icon className="size-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-fg">{step.title}</h3>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="ml-auto hidden font-mono text-fg-subtle lg:inline">
                  →
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{step.body}</p>
          </li>
        )
      })}
    </ol>
  )
}
