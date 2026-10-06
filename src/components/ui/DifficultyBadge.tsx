import { Badge, type BadgeTone } from './Badge'

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'

export const DIFFICULTY_TONE: Record<Difficulty, BadgeTone> = {
  Beginner: 'healthy',
  Intermediate: 'degraded',
  Advanced: 'failed',
}

/** The level is spelled out, so the colour is never the only signal. */
export function DifficultyBadge({ level, className }: { level: Difficulty; className?: string }) {
  return (
    <Badge tone={DIFFICULTY_TONE[level]} className={className}>
      {level}
    </Badge>
  )
}
