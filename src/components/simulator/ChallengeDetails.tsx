import { ArrowLeft, ArrowRight, Gauge } from 'lucide-react'
import type { Challenge } from '@/lib/architecture'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ChallengeBrief } from './ChallengeBrief'
import { DIFFICULTY_TONE } from '@/components/ui/DifficultyBadge'

interface ChallengeDetailsProps {
  challenge: Challenge
  hasDraft: boolean
  onBack: () => void
  onStart: () => void
}

export function ChallengeDetails({ challenge, hasDraft, onBack, onStart }: ChallengeDetailsProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[13px] text-fg-subtle hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden="true" /> All challenges
      </button>
      <header className="mt-4 border-b border-border pb-6">
        <div className="flex items-center gap-2">
          <Badge tone={DIFFICULTY_TONE[challenge.difficulty]}>{challenge.difficulty}</Badge>
          <span className="inline-flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-fg-subtle">
            <Gauge className="size-3.5" aria-hidden="true" />
            {challenge.scale.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{challenge.title}</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{challenge.problem}</p>
      </header>

      <Card className="mt-6 p-5 sm:p-6">
        <ChallengeBrief challenge={challenge} />
      </Card>

      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-[13px] text-fg-subtle">
          There is no single correct answer. The evaluator shows how your design behaves against these requirements, and what each
          choice costs.
        </p>
        <Button variant="primary" size="lg" onClick={onStart}>
          {hasDraft ? 'Continue Designing' : 'Start Designing'} <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
