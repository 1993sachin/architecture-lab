import { clock } from '@/lib/incident/format'

interface Marker {
  time: number
  label: string
  kind: 'decision' | 'event'
}

interface StoryChartProps {
  title: string
  points: { time: number; value: number }[]
  maxTime: number
  format: (value: number) => string
  /** SLO or budget line. */
  threshold?: { value: number; label: string }
  markers?: Marker[]
  /** Fixed domain; defaults to data range (including the threshold). */
  min?: number
  max?: number
  /** Report the lowest value instead of the peak (for availability). */
  showLowest?: boolean
}

/**
 * One metric over the whole incident, with your decisions (solid) and the
 * scenario's events (dashed) drawn on it, so cause and effect line up.
 */
export function StoryChart({ title, points, maxTime, format, threshold, markers = [], min, max, showLowest = false }: StoryChartProps) {
  const W = 320
  const H = 96
  const pad = { l: 4, r: 4, t: 8, b: 14 }
  const values = points.map((point) => point.value)
  const lo = min ?? Math.min(0, ...values)
  const hi = max ?? Math.max(...values, threshold?.value ?? -Infinity) * 1.05
  const span = hi - lo || 1
  const x = (time: number) => pad.l + (time / maxTime) * (W - pad.l - pad.r)
  const y = (value: number) => pad.t + (1 - (Math.min(Math.max(value, lo), hi) - lo) / span) * (H - pad.t - pad.b)
  const line = points.map((point) => `${x(point.time).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const extreme = values.length ? (showLowest ? Math.min(...values) : Math.max(...values)) : 0
  return (
    <figure className="rounded-md border border-border bg-surface-2 p-2">
      <figcaption className="flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-fg">{title}</span>
        <span className="font-mono text-fg-subtle">{showLowest ? 'lowest' : 'peak'} {format(extreme)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full" role="img" aria-label={`${title} over the incident`}>
        {markers.map((marker, index) => (
          <g key={`${marker.kind}-${marker.time}-${index}`}>
            <title>{`${clock(marker.time)} ${marker.label}`}</title>
            <line
              x1={x(marker.time)}
              x2={x(marker.time)}
              y1={pad.t}
              y2={H - pad.b}
              stroke={marker.kind === 'decision' ? 'var(--accent)' : 'var(--warning)'}
              strokeWidth={1}
              strokeDasharray={marker.kind === 'event' ? '3 3' : undefined}
              opacity={0.7}
            />
          </g>
        ))}
        {threshold && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(threshold.value)} y2={y(threshold.value)} stroke="var(--failed)" strokeWidth={1} strokeDasharray="4 2" opacity={0.8} />
            <text x={W - pad.r} y={y(threshold.value) - 2} textAnchor="end" fontSize="8" fill="var(--failed)">
              {threshold.label}
            </text>
          </g>
        )}
        <polyline points={line} fill="none" stroke="var(--fg)" strokeWidth={1.5} strokeLinejoin="round" />
        {[0, 15, 30, 45].filter((t) => t <= maxTime).map((t) => (
          <text key={t} x={x(t)} y={H - 2} fontSize="8" fill="var(--fg-subtle)" textAnchor={t === 0 ? 'start' : t === maxTime ? 'end' : 'middle'}>
            {clock(t)}
          </text>
        ))}
      </svg>
    </figure>
  )
}
