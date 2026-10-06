import { StatusBadge } from '@/components/ui/StatusBadge'
import type { NodeStatus } from '@/types/status'

const DEFAULT: NodeStatus[] = ['healthy', 'warning', 'degraded', 'failed', 'offline']

export type LegendFlow = 'requests' | 'failed' | 'retry' | 'queued'

const FLOW_LINES: Record<Exclude<LegendFlow, 'requests'>, { label: string; stroke: string; dash: string }> = {
  failed: { label: 'broken link', stroke: 'var(--failed)', dash: '3 3' },
  retry: { label: 'retry', stroke: 'var(--warning)', dash: '6 3' },
  queued: { label: 'queued', stroke: 'var(--info)', dash: '2 3' },
}

/** Key for node states and edge styles used in architecture diagrams. */
export function DiagramLegend({
  statuses = DEFAULT,
  flows = ['requests', 'failed'],
}: {
  statuses?: NodeStatus[]
  flows?: LegendFlow[]
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Diagram legend">
      {statuses.map((s) => (
        <li key={s}>
          <StatusBadge status={s} />
        </li>
      ))}
      {flows.includes('requests') && (
        <li className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <svg width="18" height="6" aria-hidden="true">
            <circle cx="4" cy="3" r="2.5" fill="var(--accent)" />
            <line x1="0" y1="3" x2="18" y2="3" stroke="var(--border-strong)" strokeWidth="1.5" />
            <circle cx="12" cy="3" r="2.5" fill="var(--accent)" />
          </svg>
          requests
        </li>
      )}
      {flows.map((flow) => {
        if (flow === 'requests') return null
        const line = FLOW_LINES[flow]
        return (
          <li key={flow} className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke={line.stroke} strokeWidth="1.5" strokeDasharray={line.dash} />
            </svg>
            {line.label}
          </li>
        )
      })}
    </ul>
  )
}
