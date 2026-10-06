import { StatusBadge } from '@/components/ui/StatusBadge'
import type { NodeStatus } from '@/types/status'

const DEFAULT: NodeStatus[] = ['healthy', 'warning', 'degraded', 'failed', 'offline']

/** Key for node states and edge styles used in architecture diagrams. */
export function DiagramLegend({ statuses = DEFAULT }: { statuses?: NodeStatus[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Diagram legend">
      {statuses.map((s) => (
        <li key={s}>
          <StatusBadge status={s} />
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
        <svg width="18" height="6" aria-hidden="true">
          <circle cx="4" cy="3" r="2.5" fill="var(--accent)" />
          <line x1="0" y1="3" x2="18" y2="3" stroke="var(--border-strong)" strokeWidth="1.5" />
          <circle cx="12" cy="3" r="2.5" fill="var(--accent)" />
        </svg>
        requests
      </li>
      <li className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
        <svg width="18" height="6" aria-hidden="true">
          <line x1="0" y1="3" x2="18" y2="3" stroke="var(--failed)" strokeWidth="1.5" strokeDasharray="3 3" />
        </svg>
        broken link
      </li>
    </ul>
  )
}
