import { useState } from 'react'
import { Dices, Play, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'

export interface TryIdea {
  id: string
  text: string
  /** What to watch for once it is set up. */
  watch?: string
  /** Sets the experiment up for this idea. */
  run?: () => void
}

/** "Give Me Something to Try": a random, meaningful next action for when the page feels blank. */
export function TrySomething({ ideas, className }: { ideas: TryIdea[]; className?: string }) {
  const [idea, setIdea] = useState<TryIdea | null>(null)
  const [applied, setApplied] = useState(false)

  const pick = () => {
    const pool = ideas.filter((i) => i.id !== idea?.id)
    setIdea(pool[Math.floor(Math.random() * pool.length)] ?? ideas[0])
    setApplied(false)
  }

  return (
    <div className={className}>
      <Button variant="secondary" size="sm" onClick={pick}>
        <Dices className="size-3.5" aria-hidden="true" /> Give Me Something to Try
      </Button>
      {idea && (
        <div
          className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border border-border bg-surface px-3 py-2.5"
          role="status"
        >
          <div className="min-w-0 flex-1 basis-60">
            <p className="text-[13px] font-medium text-fg">{idea.text}</p>
            {idea.watch && (
              <p className={cn('mt-0.5 text-xs', applied ? 'text-accent' : 'text-fg-subtle')}>Watch: {idea.watch}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {idea.run && !applied && (
              <Button
                variant="primary"
                size="sm"
                className="h-7"
                onClick={() => {
                  idea.run!()
                  setApplied(true)
                }}
              >
                <Play className="size-3.5" aria-hidden="true" /> Set it up
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7" onClick={pick}>
              Another idea
            </Button>
            <button
              type="button"
              aria-label="Close suggestion"
              onClick={() => setIdea(null)}
              className="inline-flex size-7 items-center justify-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
