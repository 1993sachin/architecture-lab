import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { experiments } from '@/data/experiments'
import { useGuideStore } from '@/store/guideStore'
import { DifficultyBadge } from '@/components/ui/DifficultyBadge'

const LESSONS: Record<string, { short: string; lesson: string }> = {
  microfrontend: { short: 'Microfrontends', lesson: 'Learn isolation' },
  resilience: { short: 'Resilience', lesson: 'Learn failure handling' },
  simulator: { short: 'System Design', lesson: 'Learn architectural trade-offs' },
}

const LATER = ['Performance', 'Event-Driven Architecture', 'AI Architecture']

/** Your Architecture Journey: the recommended order, with progress from finished guides. */
export function LearningPath() {
  const completed = useGuideStore((s) => s.completed)
  const nextIndex = experiments.findIndex((e) => !completed[e.guideId])

  return (
    <div>
      <ol className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        {experiments.map((exp, i) => {
          const done = !!completed[exp.guideId]
          const next = i === nextIndex
          const info = LESSONS[exp.id] ?? { short: exp.title, lesson: '' }
          return (
            <Fragment key={exp.id}>
              {i > 0 && (
                <li aria-hidden="true" className="flex justify-center text-fg-subtle">
                  <ArrowDown className="size-4 md:hidden" />
                  <ArrowRight className="hidden size-4 md:block" />
                </li>
              )}
              <li className="flex-1">
                <Link
                  to={exp.path}
                  className={cn(
                    'group flex h-full flex-col rounded-lg border bg-surface p-4 transition-colors hover:border-border-strong',
                    next ? 'border-accent/60' : 'border-border',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] text-fg-subtle">0{i + 1}</span>
                    <DifficultyBadge level={exp.difficulty} />
                  </span>
                  <span className="mt-2 text-[15px] font-semibold text-fg">{info.short}</span>
                  <span className="text-[13px] text-fg-muted">{info.lesson}</span>
                  <span
                    className={cn(
                      'mt-3 inline-flex items-center gap-1 text-[12px] font-medium',
                      done ? 'text-healthy' : next ? 'text-accent' : 'text-fg-subtle',
                    )}
                  >
                    {done ? (
                      <>
                        <Check className="size-3.5" aria-hidden="true" /> Completed
                      </>
                    ) : next ? (
                      <>
                        {i === 0 ? 'Start here' : 'Up next'} <ArrowRight className="size-3.5" aria-hidden="true" />
                      </>
                    ) : (
                      'Not started'
                    )}
                  </span>
                </Link>
              </li>
            </Fragment>
          )
        })}
      </ol>
      <p className="mt-4 font-mono text-[11.5px] text-fg-subtle">
        Coming later: {LATER.map((l, i) => `0${i + 4} ${l}`).join(' · ')}
      </p>
    </div>
  )
}
