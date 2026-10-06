import { Fragment } from 'react'
import { cn } from '@/lib/cn'

/** ●────●────○────○  2 of 4. Subtle on purpose. */
export function ExperimentProgress({ current, total, done = false }: { current: number; total: number; done?: boolean }) {
  const shown = done ? total : current + 1
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={done ? `All ${total} steps complete` : `Step ${shown} of ${total}`}
    >
      <div className="flex items-center" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <Fragment key={i}>
            {i > 0 && <span className={cn('h-px w-4 sm:w-6', i <= current || done ? 'bg-accent' : 'bg-border-strong')} />}
            <span
              className={cn(
                'size-2 rounded-full border',
                i < current || done
                  ? 'border-accent bg-accent'
                  : i === current
                    ? 'border-accent bg-accent-soft'
                    : 'border-border-strong',
              )}
            />
          </Fragment>
        ))}
      </div>
      <span className="font-mono text-[11px] text-fg-subtle">
        {shown} of {total}
      </span>
    </div>
  )
}
