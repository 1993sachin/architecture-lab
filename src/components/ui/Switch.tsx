import { useId } from 'react'
import { cn } from '@/lib/cn'

interface SwitchProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

/** Labelled toggle built on a native button with role="switch". */
export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-fg-subtle">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
          checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-3',
        )}
      >
        <span
          className={cn(
            'inline-block size-3.5 rounded-full shadow-sm transition-transform',
            checked ? 'translate-x-[18px] bg-accent-fg' : 'translate-x-[2px] bg-fg-subtle',
          )}
        />
      </button>
    </div>
  )
}
