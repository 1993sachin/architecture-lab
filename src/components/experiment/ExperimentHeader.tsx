import type { ReactNode } from 'react'
import { DifficultyBadge, type Difficulty } from '@/components/ui/DifficultyBadge'

interface ExperimentHeaderProps {
  eyebrow: string
  title: string
  description: ReactNode
  actions?: ReactNode
  difficulty?: Difficulty
  children?: ReactNode
}

export function ExperimentHeader({ eyebrow, title, description, actions, difficulty, children }: ExperimentHeaderProps) {
  return (
    <header className="border-b border-border pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 flex items-center gap-2 font-mono text-xs tracking-wide text-accent uppercase">
            {eyebrow}
            {difficulty && <DifficultyBadge level={difficulty} />}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
          <div className="mt-2 text-[15px] leading-relaxed text-fg-muted">{description}</div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
