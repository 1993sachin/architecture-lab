import { useEffect, useRef, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'

const LEVELS = ['Hint 1 · a clue', 'Hint 2 · narrower', 'Hint 3 · the answer']

interface HintPanelProps {
  /** Up to three hints, from a conceptual clue to the answer. */
  hints: string[]
  /** Changing this starts over: new step, new hints, new timer. */
  resetKey: unknown
  /** Offer help after this long without any interaction. */
  idleMs?: number
  className?: string
}

/**
 * Offers a hint when the visitor seems stuck, without interrupting them:
 * an inline card after a stretch of inactivity, plus an always-available
 * "Need a hint?" link for keyboard and screen-reader users.
 */
export function HintPanel({ hints, resetKey, idleMs = 30_000, className }: HintPanelProps) {
  const [offered, setOffered] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [level, setLevel] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setOffered(false)
    setDeclined(false)
    setLevel(0)
  }, [resetKey])

  useEffect(() => {
    if (declined || level > 0 || !hints.length) return
    const arm = () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setOffered(true), idleMs)
    }
    arm()
    const events = ['pointerdown', 'keydown'] as const
    events.forEach((e) => window.addEventListener(e, arm))
    return () => {
      window.clearTimeout(timer.current)
      events.forEach((e) => window.removeEventListener(e, arm))
    }
  }, [resetKey, declined, level, idleMs, hints.length])

  if (!hints.length) return null

  if (level === 0 && !offered) {
    return (
      <button
        type="button"
        onClick={() => setLevel(1)}
        className={cn(
          'inline-flex items-center gap-1 text-xs text-fg-subtle underline-offset-2 hover:text-fg hover:underline',
          className,
        )}
      >
        <Lightbulb className="size-3.5" aria-hidden="true" /> Need a hint?
      </button>
    )
  }

  if (level === 0) {
    return (
      <div
        role="status"
        className={cn('flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2', className)}
      >
        <Lightbulb className="size-4 text-accent" aria-hidden="true" />
        <span className="text-[13px] text-fg">Need a hint?</span>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setLevel(1)}>
            Give Hint
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOffered(false)
              setDeclined(true)
            }}
          >
            I’m Good
          </Button>
        </div>
      </div>
    )
  }

  const shown = hints.slice(0, level)
  return (
    <div className={cn('rounded-md border border-border bg-surface-2/60 px-3 py-2.5', className)} aria-live="polite">
      <ol className="space-y-1.5">
        {shown.map((hint, i) => (
          <li key={i} className="text-[13px] leading-relaxed text-fg">
            <span className="mr-1.5 font-mono text-[10.5px] tracking-wide text-fg-subtle uppercase">{LEVELS[i]}</span>
            {hint}
          </li>
        ))}
      </ol>
      {level < hints.length && (
        <button
          type="button"
          onClick={() => setLevel(level + 1)}
          className="mt-2 text-xs font-medium text-accent hover:underline"
        >
          {level === hints.length - 1 ? 'Show me the answer' : 'Another hint'}
        </button>
      )}
    </div>
  )
}
