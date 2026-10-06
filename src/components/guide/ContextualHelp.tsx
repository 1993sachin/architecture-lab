import { useEffect, useId, useRef, useState } from 'react'
import { CircleHelp, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface HelpContent {
  looking: string
  change: string
  tryThis: string
  learn: string
}

const SECTIONS: Array<[keyof HelpContent, string]> = [
  ['looking', 'What am I looking at?'],
  ['change', 'What can I change?'],
  ['tryThis', 'What should I try?'],
  ['learn', 'What should I learn?'],
]

/** "? How it works": four short answers in a small popover, never a giant modal. */
export function ContextualHelp({ content, className }: { content: HelpContent; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <CircleHelp className="size-3.5" aria-hidden="true" /> How it works
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="How it works"
          className="absolute top-full right-0 z-30 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-4 shadow-lg"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
          <dl className="space-y-3">
            {SECTIONS.map(([key, label]) => (
              <div key={key}>
                <dt className="text-[12px] font-semibold text-fg">{label}</dt>
                <dd className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{content[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
