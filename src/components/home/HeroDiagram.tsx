import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { StatusBadge, StatusDot } from '@/components/ui/StatusBadge'
import type { NodeStatus } from '@/types/status'

/**
 * A deliberately tiny, self-contained preview of what the experiments do:
 * click a module to take it offline and compare how a monolith and
 * microfrontends contain the failure. The full experiment lives at
 * /experiments/microfrontend.
 */

type Mode = 'monolith' | 'microfrontends'
type ModuleId = 'workspace' | 'content' | 'analytics'

const W = 600
const H = 300

const shell = { x: 300, y: 48 }
const modules: Array<{ id: ModuleId; label: string; x: number }> = [
  { id: 'workspace', label: 'Workspace', x: 110 },
  { id: 'content', label: 'Content', x: 300 },
  { id: 'analytics', label: 'Analytics', x: 490 },
]
const MODULE_Y = 160
const API_Y = 252

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

const pct = (v: number, total: number) => `${(v / total) * 100}%`

export function HeroDiagram() {
  const [mode, setMode] = useState<Mode>('microfrontends')
  const [offline, setOffline] = useState<Set<ModuleId>>(() => new Set())
  const reducedMotion = usePrefersReducedMotion()

  const toggle = (id: ModuleId) =>
    setOffline((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const anyOffline = offline.size > 0
  // In a monolith every module ships in one bundle, so one crash takes the page down.
  const pageDown = mode === 'monolith' && anyOffline

  const statusOf = (id: ModuleId): NodeStatus => {
    if (offline.has(id)) return 'failed'
    if (pageDown) return 'offline'
    return 'healthy'
  }
  const shellStatus: NodeStatus = pageDown ? 'failed' : anyOffline ? 'degraded' : 'healthy'

  const availability = useMemo(() => {
    if (pageDown) return 0
    return Math.round(((modules.length - offline.size) / modules.length) * 100)
  }, [pageDown, offline])

  const explanation = !anyOffline
    ? 'All modules are healthy. Click a module to take it offline.'
    : pageDown
      ? 'Every module ships in a single bundle, so one failure takes the whole page down.'
      : `${[...offline].map((id) => modules.find((m) => m.id === id)!.label).join(' and ')} ${offline.size > 1 ? 'are' : 'is'} offline. The shell loads modules independently, so the rest of the app keeps working.`

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_0_0_1px_var(--border),0_20px_60px_-30px_rgb(0_0_0/0.5)]">
      {/* Window chrome */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[11px] text-fg-subtle">
          <span className="flex gap-1" aria-hidden="true">
            <span className="size-2 rounded-full bg-surface-3" />
            <span className="size-2 rounded-full bg-surface-3" />
            <span className="size-2 rounded-full bg-surface-3" />
          </span>
          live-preview / fault-isolation
        </div>
        <button
          type="button"
          onClick={() => setOffline(new Set())}
          disabled={!anyOffline}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-fg-subtle transition-colors hover:text-fg disabled:opacity-40"
        >
          <RotateCcw className="size-3" aria-hidden="true" /> Reset
        </button>
      </div>

      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <SegmentedControl
          label="Architecture"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'monolith', label: 'Monolith' },
            { value: 'microfrontends', label: 'Microfrontends' },
          ]}
          className="sm:w-64"
        />
        <dl className="flex gap-6 font-mono text-xs">
          <div>
            <dt className="text-fg-subtle">Availability</dt>
            <dd
              className={cn(
                'mt-0.5 text-base font-medium tabular-nums',
                availability === 100 ? 'text-healthy' : availability === 0 ? 'text-failed' : 'text-degraded',
              )}
            >
              {availability}%
            </dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Blast radius</dt>
            <dd className="mt-0.5 text-base font-medium text-fg tabular-nums">
              {pageDown ? modules.length : offline.size}/{modules.length}
            </dd>
          </div>
        </dl>
      </div>

      {/* Diagram */}
      <div className="bg-grid relative" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden="true">
          {modules.map((m) => {
            const status = statusOf(m.id)
            const broken = status !== 'healthy'
            const top = edgePath(shell.x, shell.y + 18, m.x, MODULE_Y - 18)
            const bottom = edgePath(m.x, MODULE_Y + 18, m.x, API_Y - 14)
            const stroke = broken ? 'var(--failed)' : 'var(--border-strong)'
            return (
              <g key={m.id}>
                <path
                  d={top}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.5}
                  strokeDasharray={broken ? '4 4' : undefined}
                  className={broken && !reducedMotion ? 'animate-flow' : undefined}
                  opacity={broken ? 0.7 : 1}
                />
                <path d={bottom} fill="none" stroke={broken ? 'var(--border)' : 'var(--border-strong)'} strokeWidth={1.5} />
                {!broken && !reducedMotion && (
                  <>
                    <circle r={3} fill="var(--accent)">
                      <animateMotion dur="1.8s" repeatCount="indefinite" path={top} begin={`-${modules.indexOf(m) * 0.4}s`} />
                    </circle>
                    <circle r={2.5} fill="var(--accent)" opacity={0.6}>
                      <animateMotion
                        dur="1.2s"
                        repeatCount="indefinite"
                        path={bottom}
                        begin={`-${modules.indexOf(m) * 0.3 + 0.6}s`}
                      />
                    </circle>
                  </>
                )}
                {status === 'failed' && (
                  <g transform={`translate(${(shell.x + m.x) / 2} ${(shell.y + MODULE_Y) / 2})`}>
                    <circle r={8} fill="var(--surface)" stroke="var(--failed)" />
                    <path d="M -3 -3 L 3 3 M 3 -3 L -3 3" stroke="var(--failed)" strokeWidth={1.5} />
                  </g>
                )}
              </g>
            )
          })}
        </svg>

        {/* Shell node */}
        <DiagramNode x={shell.x} y={shell.y} label="Application Shell" sub="host" status={shellStatus} wide />

        {/* MFE nodes: interactive */}
        {modules.map((m) => (
          <DiagramNode
            key={m.id}
            x={m.x}
            y={MODULE_Y}
            label={m.label}
            sub={mode === 'monolith' ? 'module' : 'MFE'}
            status={statusOf(m.id)}
            pressed={offline.has(m.id)}
            onClick={() => toggle(m.id)}
            actionLabel={`${offline.has(m.id) ? 'Restore' : 'Take offline'}: ${m.label}`}
          />
        ))}

        {/* API nodes */}
        {modules.map((m) => (
          <div
            key={m.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-fg-subtle"
            style={{ left: pct(m.x, W), top: pct(API_Y, H) }}
          >
            {m.label.toLowerCase()}-api
          </div>
        ))}
      </div>

      <p
        aria-live="polite"
        className="min-h-[3.25rem] border-t border-border px-4 py-3 text-[13px] leading-relaxed text-fg-muted"
      >
        <span className="mr-1.5 font-mono text-[11px] text-fg-subtle uppercase">What happened</span>
        {explanation}
      </p>
    </div>
  )
}

interface DiagramNodeProps {
  x: number
  y: number
  label: string
  sub: string
  status: NodeStatus
  onClick?: () => void
  pressed?: boolean
  actionLabel?: string
  wide?: boolean
}

function DiagramNode({ x, y, label, sub, status, onClick, pressed, actionLabel, wide }: DiagramNodeProps) {
  const style = { left: pct(x, W), top: pct(y, H) }
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <StatusDot status={status} pulse={status === 'failed'} />
        <span className="truncate text-[11px] font-semibold text-fg sm:text-xs">{label}</span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-fg-subtle">{sub}</span>
        <span className="hidden sm:inline-flex">
          <StatusBadge status={status} className="text-[10px]" />
        </span>
      </span>
    </>
  )
  const className = cn(
    'absolute flex max-w-40 -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 rounded-md border bg-surface px-2 py-1.5 text-left transition-colors sm:px-2.5',
    wide ? 'w-[36%]' : 'w-[27%]',
    status === 'healthy' && 'border-border-strong',
    status === 'degraded' && 'border-degraded/50',
    status === 'failed' && 'border-failed/60 bg-failed/5',
    status === 'offline' && 'border-border border-dashed',
  )

  if (!onClick) {
    return (
      <div className={className} style={style}>
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={actionLabel}
      className={cn(className, 'cursor-pointer hover:border-fg-subtle')}
      style={style}
    >
      {body}
    </button>
  )
}
