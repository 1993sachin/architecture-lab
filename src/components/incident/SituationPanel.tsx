import { ChevronRight, Radio } from 'lucide-react'
import type { SymptomExplanation } from '@/lib/incident/reasoning'
import { ChainView } from './Learn'
import { Eyebrow } from './shared'

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
            {why.chains.map((chain) => (
              <ChainView key={chain.id} chain={chain} />
            ))}
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
              <p className="mt-1.5">There is no universal “increase availability” button. Which approach makes sense depends on why requests are failing.</p>
            </div>
          </div>
        </details>
      )}
    </section>
  )
}
