import { memo } from 'react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'

export interface LogEntry {
  id: number
  method?: string
  path: string
  status: number
  latency: number
  note: string
  outcome: 'ok' | 'cached' | 'failed'
}

const outcomeLabel = { ok: 'OK', cached: 'STALE', failed: 'FAIL' } as const

/** Live tail of simulated requests, newest first. */
export const RequestLog = memo(function RequestLog({ entries, className }: { entries: LogEntry[]; className?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">Request log</h2>
        <span className="font-mono text-[10px] text-fg-subtle">newest first</span>
      </div>
      <ol className="flex-1 divide-y divide-border/60 overflow-hidden font-mono text-[11px]">
        {entries.map((e) => (
          <li key={e.id} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 px-4 py-1.5 sm:grid-cols-[4.5rem_8rem_1fr_3.5rem]">
            <span
              className={cn(
                'whitespace-nowrap rounded px-1 py-px text-center text-[9.5px] font-medium',
                e.outcome === 'ok' && 'bg-healthy/10 text-healthy',
                e.outcome === 'cached' && 'bg-degraded/10 text-degraded',
                e.outcome === 'failed' && 'bg-failed/10 text-failed',
              )}
            >
              {e.status} {outcomeLabel[e.outcome]}
            </span>
            <span className="truncate text-fg">
              {e.method ?? 'GET'} {e.path}
            </span>
            <span className="hidden truncate text-fg-subtle sm:block">{e.note === 'ok' ? '' : e.note}</span>
            <span className="text-right text-fg-muted tabular-nums">{e.latency} ms</span>
          </li>
        ))}
      </ol>
    </Card>
  )
})
