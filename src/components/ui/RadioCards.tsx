import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface RadioCardOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Visual tone when selected. */
  tone?: 'neutral' | 'failed'
}

interface RadioCardsProps<T extends string> {
  label: string
  options: RadioCardOption<T>[]
  value: T
  onChange: (value: T) => void
  columns?: 2 | 4
}

/** Radio group rendered as a grid of small cards; arrow keys move the selection. */
export function RadioCards<T extends string>({ label, options, value, onChange, columns = 2 }: RadioCardsProps<T>) {
  const labelId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(event: KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = (index + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div>
      <div id={labelId} className="mb-1.5 text-xs font-medium text-fg-subtle">
        {label}
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className={cn('grid gap-1.5', columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
        {options.map((option, index) => {
          const selected = option.value === value
          const failed = selected && option.tone === 'failed'
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors',
                failed
                  ? 'border-failed/50 bg-failed/10 text-failed'
                  : selected
                    ? 'border-fg-subtle bg-surface-2 text-fg'
                    : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
              )}
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
