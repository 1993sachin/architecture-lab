import { memo } from 'react'
import { AlertTriangle, Clock, History, RefreshCw, ServerCrash } from 'lucide-react'
import { cn } from '@/lib/cn'
import { MODULE_LABELS, type MfeConfig, type MfeMetrics, type MfeTopology, type ModuleId } from '@/lib/simulation/microfrontend'
import { Card } from '@/components/ui/Card'

interface MfeUserViewProps {
  config: MfeConfig
  metrics: MfeMetrics
  topology: MfeTopology
}

/** A mock of the page as an end user sees it, so degraded UX is concrete. */
export const MfeUserView = memo(function MfeUserView({ config, metrics, topology }: MfeUserViewProps) {
  const pageDown = topology.shell === 'failed'
  const slowStart = topology.shell === 'warning'

  return (
    <Card className="flex flex-col p-4">
      <h2 className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">What users see</h2>
      <div className="mt-3 flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg" aria-hidden="true">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-2.5 py-1.5">
          <span className="flex gap-1">
            <span className="size-1.5 rounded-full bg-border-strong" />
            <span className="size-1.5 rounded-full bg-border-strong" />
            <span className="size-1.5 rounded-full bg-border-strong" />
          </span>
          <span className="flex-1 truncate rounded bg-surface px-2 py-0.5 font-mono text-[9.5px] text-fg-subtle">
            app.example.com/dashboard
          </span>
        </div>

        {pageDown ? (
          <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <ServerCrash className="size-6 text-failed" />
            <p className="text-[13px] font-semibold text-fg">Something went wrong</p>
            <p className="max-w-[16rem] text-[11.5px] text-fg-muted">
              The application failed to load. Every feature is unavailable, including ones that work fine.
            </p>
            <span className="mt-1 font-mono text-[10px] text-failed">HTTP 500 · whole page</span>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            {/* Shell nav */}
            <div className="relative flex items-center gap-3 border-b border-border px-3 py-2">
              <span className="size-3 rounded-sm bg-accent/70" />
              {(['workspace', 'content', 'analytics'] as ModuleId[]).map((id) => (
                <span
                  key={id}
                  className={cn(
                    'h-1.5 rounded-full',
                    topology.modules[id] === 'failed' ? 'w-10 bg-failed/40' : 'w-10 bg-border-strong',
                  )}
                />
              ))}
              {slowStart && (
                <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9.5px] text-warning">
                  <Clock className="size-3" /> waiting on remote…
                </span>
              )}
              {slowStart && <span className="absolute bottom-0 left-0 h-0.5 w-2/3 bg-warning" />}
            </div>
            <div className="grid flex-1 grid-cols-5 gap-2 p-2.5">
              <Slot id="workspace" className="col-span-3 row-span-2" config={config} metrics={metrics} topology={topology} />
              <Slot id="content" className="col-span-2" config={config} metrics={metrics} topology={topology} />
              <Slot id="analytics" className="col-span-2" config={config} metrics={metrics} topology={topology} />
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11.5px] text-fg-subtle">
        {pageDown
          ? 'A single failure blanks the entire page.'
          : config.failures.length
            ? config.failures.length > 1
              ? 'Each broken module shows its own fallback. Everything else stays usable.'
              : 'The broken module shows a fallback. Everything else stays usable.'
            : 'All three modules render normally.'}
      </p>
    </Card>
  )
})

function Slot({ id, className, metrics, topology }: { id: ModuleId; className?: string } & MfeUserViewProps) {
  const status = topology.modules[id]
  const cached = metrics.moduleCacheRate[id] > 0
  const label = MODULE_LABELS[id]

  if (status === 'failed') {
    return (
      <div
        className={cn(
          'flex min-h-20 flex-col items-center justify-center gap-1 rounded border border-dashed border-failed/40 bg-failed/[0.05] p-2 text-center',
          className,
        )}
      >
        {cached ? <History className="size-3.5 text-degraded" /> : <AlertTriangle className="size-3.5 text-failed" />}
        <span className="text-[10.5px] font-medium text-fg">
          {cached ? `${label}: showing cached data` : `${label} is unavailable`}
        </span>
        {!cached && (
          <span className="inline-flex items-center gap-1 text-[9.5px] text-fg-subtle">
            <RefreshCw className="size-2.5" /> Retry
          </span>
        )}
      </div>
    )
  }

  const shaky = status === 'degraded' || status === 'warning'
  return (
    <div
      className={cn(
        'flex min-h-20 flex-col gap-1.5 rounded border p-2',
        shaky ? 'border-degraded/40' : 'border-border',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-fg-muted">{label}</span>
        {shaky && <span className="font-mono text-[9px] text-degraded">some errors</span>}
      </div>
      <span className="h-1.5 w-4/5 rounded-full bg-surface-3" />
      <span className="h-1.5 w-3/5 rounded-full bg-surface-3" />
      <span className="h-1.5 w-2/3 rounded-full bg-surface-3" />
    </div>
  )
}
