import { useId } from 'react'

interface SparklineProps {
  values: number[]
  /** Fixed domain; defaults to the data's own min/max. */
  min?: number
  max?: number
  className?: string
  /** CSS color for the line, e.g. 'var(--healthy)'. */
  color?: string
}

/** Tiny single-series trend line for stat tiles. Purely decorative: the tile states the value. */
export function Sparkline({ values, min, max, className, color = 'var(--fg-subtle)' }: SparklineProps) {
  const gradientId = useId()
  if (values.length < 2) return <div className={className} />
  const W = 100
  const H = 28
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - 2 - ((Math.min(Math.max(v, lo), hi) - lo) / span) * (H - 4)
    return [x, y] as const
  })
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
