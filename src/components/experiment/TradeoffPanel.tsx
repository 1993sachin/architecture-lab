import { Minus, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export interface TradeoffItem {
  title: string
  body: string
}

interface TradeoffPanelProps {
  title: string
  description?: string
  advantages: TradeoffItem[]
  costs: TradeoffItem[]
}

export function TradeoffPanel({ title, description, advantages, costs }: TradeoffPanelProps) {
  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-fg-subtle">{description}</p>}
      </div>
      <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        <TradeoffList heading="Advantages" items={advantages} kind="plus" />
        <TradeoffList heading="Costs" items={costs} kind="minus" />
      </div>
    </Card>
  )
}

function TradeoffList({ heading, items, kind }: { heading: string; items: TradeoffItem[]; kind: 'plus' | 'minus' }) {
  const Icon = kind === 'plus' ? Plus : Minus
  return (
    <section className="p-4">
      <h3 className={kind === 'plus' ? 'text-xs font-semibold text-healthy' : 'text-xs font-semibold text-degraded'}>{heading}</h3>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.title} className="flex gap-2.5">
            <span
              className={
                'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded ' +
                (kind === 'plus' ? 'bg-healthy/10 text-healthy' : 'bg-degraded/10 text-degraded')
              }
            >
              <Icon className="size-3" aria-hidden="true" />
            </span>
            <div>
              <div className="text-[13px] font-medium text-fg">{item.title}</div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
