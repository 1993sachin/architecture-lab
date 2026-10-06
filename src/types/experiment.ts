import type { LucideIcon } from 'lucide-react'
import type { Difficulty } from '@/components/ui/DifficultyBadge'

export interface ExperimentMeta {
  id: string
  title: string
  path: string
  summary: string
  /** What the visitor can do in one line, e.g. "Take a microfrontend offline". */
  tryThis: string
  concepts: string[]
  icon: LucideIcon
  status: 'available' | 'coming-soon'
  difficulty: Difficulty
  /** Id of the experiment's guided walkthrough, for progress on the learning path. */
  guideId: string
}
