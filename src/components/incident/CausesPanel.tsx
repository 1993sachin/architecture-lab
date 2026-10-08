import { Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Hypothesis, HypothesisStatus } from '@/lib/incident/reasoning'
import { Eyebrow } from './shared'

const STATUS: Record<HypothesisStatus, { label: string; className: string }> = {
  likely: { label: 'Evidence suggests', className: 'border-failed/50 bg-failed/10 text-failed' },
  active: { label: 'Happening', className: 'border-warning/50 bg-warning/10 text-warning' },
  possible: { label: 'Could be', className: 'border-warning/40 text-warning' },
  unknown: { label: 'You don’t know yet', className: 'border-dashed border-border-strong text-fg-muted' },
  unlikely: { label: 'Evidence points away', className: 'border-border text-fg-subtle' },
}

/**
 * Possible causes, each with the evidence for its status. Never a diagnosis:
 * a cause the operator has not investigated stays "you don't know yet".
 */
export function CausesPanel({ causes, onCheck, compact }: { causes: Hypothesis[]; onCheck?: (actionId: string) => void; compact: boolean }) {
  // Later in the incident, ruled-out causes get out of the way.
  const shown = compact ? causes.filter((cause) => cause.status !== 'unlikely') : causes
  const open = causes.some((cause) => cause.status === 'unknown')
  return (
    <section aria-labelledby="possible-causes" className="rounded-lg border border-border bg-surface p-4">
      <Eyebrow className="mb-2 text-fg">
        <span id="possible-causes">What might be causing it?</span>
      </Eyebrow>
      <ul className="space-y-2.5" aria-label="Possible causes">
        {shown.map((cause) => (
          <li key={cause.id} data-testid={`cause-${cause.id}`} className={cn(cause.status === 'unlikely' && 'opacity-75')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-fg">{cause.label}</span>
              <span className={cn('rounded border px-1.5 py-px font-mono text-[10px] tracking-wide uppercase', STATUS[cause.status].className)}>{STATUS[cause.status].label}</span>
            </div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{cause.evidence}</p>
            {cause.check && onCheck && (
              <button type="button" onClick={() => onCheck(cause.check!.actionId)} className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-info hover:underline">
                <Search className="size-3" aria-hidden="true" />
                {cause.check.title}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-fg-subtle">
        {open ? 'These are possibilities, not a diagnosis. You don’t have enough information to rule some of them out yet.' : 'These are possibilities, not a diagnosis.'}
      </p>
    </section>
  )
}
