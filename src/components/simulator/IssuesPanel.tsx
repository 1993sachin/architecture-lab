import { AlertTriangle, CheckCircle2, Lightbulb, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { IssueSeverity, ValidationResult } from '@/lib/architecture'

const META: Record<IssueSeverity, { label: string; icon: typeof XCircle; tone: string }> = {
  error: { label: 'Errors', icon: XCircle, tone: 'text-failed' },
  warning: { label: 'Warnings', icon: AlertTriangle, tone: 'text-degraded' },
  suggestion: { label: 'Suggestions', icon: Lightbulb, tone: 'text-info' },
}

/** Validation results grouped by severity. Clicking an issue selects the components it is about. */
export function IssuesPanel({ validation, onFocus }: { validation: ValidationResult; onFocus: (nodeIds: string[]) => void }) {
  const { issues, blockingReason } = validation
  if (!issues.length && !blockingReason) {
    return (
      <p className="flex items-center gap-2 py-6 text-[13px] text-healthy">
        <CheckCircle2 className="size-4" aria-hidden="true" /> No structural problems. Evaluate to see how it performs.
      </p>
    )
  }
  return (
    <div className="space-y-4" aria-live="polite">
      {blockingReason && (
        <p className="rounded-md border border-border bg-surface-2 p-2.5 text-[13px] text-fg-muted">{blockingReason}</p>
      )}
      {(['error', 'warning', 'suggestion'] as const).map((sev) => {
        const list = issues.filter((i) => i.severity === sev)
        if (!list.length) return null
        const { label, icon: Icon, tone } = META[sev]
        return (
          <section key={sev}>
            <h3 className={cn('flex items-center gap-1.5 text-xs font-semibold', tone)}>
              <Icon className="size-3.5" aria-hidden="true" /> {label} ({list.length})
            </h3>
            <ul className="mt-1.5 space-y-1">
              {list.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    disabled={!i.nodeIds.length}
                    onClick={() => onFocus(i.nodeIds)}
                    className="w-full rounded px-1.5 py-1 text-left text-[12.5px] leading-snug text-fg-muted enabled:hover:bg-surface-2 enabled:hover:text-fg"
                  >
                    {i.message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
