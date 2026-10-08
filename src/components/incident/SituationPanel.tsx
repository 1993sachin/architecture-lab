import { ArrowRight, ChevronRight, Radio } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { SymptomExplanation } from '@/lib/incident/reasoning'
import { Eyebrow } from './shared'

const TONE: Record<SymptomExplanation['chain'][number]['tone'], string> = {
  up: 'text-warning',
  down: 'text-failed',
  unknown: 'text-fg-subtle',
  plain: 'text-fg',
}

/**
 * What's happening: a few sentences built from what the operator can see,
 * and, folded underneath, why the headline number is moving. Open by default
 * early in the incident; the operator can close it once they have the idea.
 */
export function SituationPanel({ lines, why, expanded }: { lines: string[]; why: SymptomExplanation | null; expanded: boolean }) {
  return (
    <section aria-labelledby="whats-happening" className="rounded-lg border border-border bg-surface p-4">
      <Eyebrow className="mb-2 flex items-center gap-1.5 text-fg">
        <Radio className="size-3.5 text-failed" aria-hidden="true" />
        <span id="whats-happening">What’s happening?</span>
      </Eyebrow>
      <ul className="space-y-1 text-[14px] leading-relaxed text-fg" data-testid="situation">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {why && (
        // Keyed by `expanded` so a change of stage resets the default, while the operator can still toggle it.
        <details key={String(expanded)} open={expanded} className="group mt-3 rounded-md border border-border bg-surface-2/60" data-testid="why">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-fg [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 text-fg-subtle transition-transform group-open:rotate-90" aria-hidden="true" />
            {why.title}
          </summary>
          <div className="space-y-3 border-t border-border px-3 py-3 text-[13px] leading-relaxed text-fg-muted">
            {why.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <ol className="flex flex-wrap items-stretch gap-1" aria-label="How load turns into failures">
              {why.chain.map((step, index) => (
                <li key={step.label} className="flex items-center gap-1">
                  {index > 0 && <ArrowRight className="size-3 shrink-0 text-fg-subtle" aria-hidden="true" />}
                  <span className="rounded border border-border bg-surface px-2 py-1">
                    <span className="block text-[11px] text-fg-subtle">{step.label}</span>
                    <span className={cn('block font-mono text-[12px]', TONE[step.tone])}>{step.value}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div>
              <p className="font-medium text-fg">What the evidence points to:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {why.associated.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-fg">Ways to improve it:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {why.remedies.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-1.5">Which approach makes sense depends on what is causing the failures. Your job is to find and relieve the bottleneck, not to change the number directly.</p>
            </div>
          </div>
        </details>
      )}
    </section>
  )
}
