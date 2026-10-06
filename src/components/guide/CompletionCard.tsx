import { ArrowRight, Compass, RotateCcw, Trophy } from 'lucide-react'
import type { GuideLink, LearningSummaryDef } from '@/lib/guide/types'
import { Button, ButtonLink } from '@/components/ui/Button'
import { LearningSummary } from './LearningSummary'

interface CompletionCardProps {
  title: string
  message: string
  learned: LearningSummaryDef
  next: GuideLink[]
  onExplore: () => void
  onRestart: () => void
}

/** The end of a guide: what just happened, what it taught, and where to go next. */
export function CompletionCard({ title, message, learned, next, onExplore, onRestart }: CompletionCardProps) {
  return (
    <div className="space-y-4" role="status">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Trophy className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="font-mono text-[10.5px] tracking-wider text-accent uppercase">Experiment complete · {title}</p>
          <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-fg">{message}</p>
        </div>
      </div>
      <LearningSummary summary={learned} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={onExplore}>
          <Compass className="size-3.5" aria-hidden="true" /> Explore Freely
        </Button>
        {next.map((n) => (
          <ButtonLink key={n.to} to={n.to} variant="secondary" size="sm">
            {n.label} <ArrowRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        ))}
        <Button variant="ghost" size="sm" onClick={onRestart}>
          <RotateCcw className="size-3.5" aria-hidden="true" /> Restart
        </Button>
      </div>
    </div>
  )
}
