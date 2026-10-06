import { memo } from 'react'
import { cn } from '@/lib/cn'
import { Sparkline } from './Sparkline'

export type MetricTone = 'neutral' | 'healthy' | 'degraded' | 'failed'

export interface Metric {
  label: string
  value: string
  unit?: string
  /** Secondary line under the value, e.g. "p95 210 ms". */
  hint?: string
  tone?: MetricTone
  series?: number[]
  seriesDomain?: [number, number]
}

const toneText: Record<MetricTone, string> = {
  neutral: 'text-fg',
  healthy: 'text-healthy',
  degraded: 'text-degraded',
  failed: 'text-failed',
}
const toneStroke: Record<MetricTone, string> = {
  neutral: 'var(--fg-subtle)',
  healthy: 'var(--healthy)',
  degraded: 'var(--degraded)',
  failed: 'var(--failed)',
}

/** Row of live stat tiles, each with an optional trend line. */
export const MetricsPanel = memo(function MetricsPanel({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1',
        className,
      )}
    >
      {metrics.map((m) => {
        const tone = m.tone ?? 'neutral'
        return (
          <div key={m.label} className="flex flex-col bg-surface px-3.5 pt-3 pb-2">
            <dt className="text-[11.5px] text-fg-subtle">{m.label}</dt>
            <dd className="mt-1 flex items-baseline gap-1">
              <span className={cn('font-mono text-xl font-medium tracking-tight tabular-nums transition-colors', toneText[tone])}>{m.value}</span>
              {m.unit && <span className="font-mono text-xs text-fg-subtle">{m.unit}</span>}
            </dd>
            <dd className="mt-0.5 h-4 truncate font-mono text-[10.5px] text-fg-subtle">{m.hint}</dd>
            {m.series && (
              <dd className="mt-1">
                <Sparkline
                  values={m.series}
                  min={m.seriesDomain?.[0]}
                  max={m.seriesDomain?.[1]}
                  color={toneStroke[tone]}
                  className="h-7 w-full"
                />
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
})
