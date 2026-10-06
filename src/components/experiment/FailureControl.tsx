import { CircleCheck, CircleSlash } from 'lucide-react'
import { RadioCards } from '@/components/ui/RadioCards'

interface FailureControlProps<T extends string> {
  label?: string
  /** The "no failure" value, e.g. 'none'. */
  normalValue: T
  targets: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

/** Picks which component to break. The normal state is always the first option. */
export function FailureControl<T extends string>({ label = 'Failure simulation', normalValue, targets, value, onChange }: FailureControlProps<T>) {
  return (
    <RadioCards
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: normalValue, label: 'Normal', icon: <CircleCheck className="size-3.5 shrink-0 text-healthy" aria-hidden="true" /> },
        ...targets.map((t) => ({
          value: t.value,
          label: t.label,
          tone: 'failed' as const,
          icon: <CircleSlash className="size-3.5 shrink-0" aria-hidden="true" />,
        })),
      ]}
    />
  )
}
