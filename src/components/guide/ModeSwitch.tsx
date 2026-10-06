import { Compass, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ExperienceMode } from '@/store/guideStore'

/** Guided Mode for a walkthrough, Free Explore for the full experiment. */
export function ModeSwitch({ mode, onChange }: { mode: ExperienceMode; onChange: (mode: ExperienceMode) => void }) {
  const options = [
    { value: 'guided' as const, label: 'Guided Mode', icon: GraduationCap },
    { value: 'free' as const, label: 'Free Explore', icon: Compass },
  ]
  return (
    <div role="group" aria-label="Experience mode" className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[12.5px] font-medium transition-colors',
            mode === value ? 'bg-surface-2 text-fg shadow-sm' : 'text-fg-subtle hover:text-fg',
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}
