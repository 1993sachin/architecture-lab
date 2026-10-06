import { Fragment } from 'react'
import { cn } from '@/lib/cn'
import { LOOP_LABELS, LOOP_PHASES, type LoopPhase } from '@/lib/guide/types'

/**
 * Choose → Build → Break → Observe → Understand → Try again. The recurring
 * visual language of the lab: guides mark the phase the visitor is in.
 */
export function LearningLoop({ active, size = 'sm', className }: { active?: LoopPhase; size?: 'sm' | 'lg'; className?: string }) {
  return (
    <ol
      aria-label="Learning loop"
      className={cn(
        'flex flex-wrap items-center font-mono uppercase',
        size === 'lg' ? 'gap-x-2 gap-y-2 text-xs' : 'gap-x-1 gap-y-1 text-[10px]',
        className,
      )}
    >
      {LOOP_PHASES.map((phase, i) => {
        const current = phase === active
        return (
          <Fragment key={phase}>
            <li
              aria-current={current ? 'step' : undefined}
              className={cn(
                'rounded border tracking-wider',
                size === 'lg' ? 'px-2.5 py-1.5' : 'px-1.5 py-0.5',
                current ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-transparent text-fg-subtle',
              )}
            >
              {current && <span aria-hidden="true">▸ </span>}
              {LOOP_LABELS[phase]}
            </li>
            {i < LOOP_PHASES.length - 1 && (
              <li aria-hidden="true" className="text-fg-subtle/60">
                →
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}
