import { ArrowRight, Check, Gauge } from 'lucide-react'
import { CHALLENGES, type Challenge } from '@/lib/architecture'
import { useSimulatorStore } from '@/store/simulatorStore'
import { Badge } from '@/components/ui/Badge'
import { DIFFICULTY_TONE } from '@/components/ui/DifficultyBadge'

/** Landing state of the simulator: pick a system-design problem. */
export function ChallengeList({ onOpen }: { onOpen: (challenge: Challenge) => void }) {
  const drafts = useSimulatorStore((s) => s.drafts)
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {CHALLENGES.map((c) => {
        const inProgress = (drafts[c.id]?.nodes.length ?? 0) > 1
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onOpen(c)}
              className="group flex h-full w-full flex-col rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:border-border-strong hover:bg-surface-2/40"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge tone={DIFFICULTY_TONE[c.difficulty]}>{c.difficulty}</Badge>
                {inProgress && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-accent">
                    <Check className="size-3" aria-hidden="true" /> draft saved
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-base font-semibold tracking-tight text-fg">{c.title}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{c.tagline}</p>
              <p className="mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
                <Gauge className="size-3.5" aria-hidden="true" />
                {c.scale.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {c.functional.map((r) => (
                  <li key={r} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
                    {r}
                  </li>
                ))}
              </ul>
              <span className="mt-auto inline-flex items-center gap-1 pt-5 text-[13px] font-medium text-fg group-hover:text-accent">
                {inProgress ? 'Continue' : 'Open challenge'}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
