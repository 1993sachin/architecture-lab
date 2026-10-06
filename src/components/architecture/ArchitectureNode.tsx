import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Power, PowerOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { StatusDot, statusMeta } from '@/components/ui/StatusBadge'
import { kindIcons } from './kindIcons'
import type { ArchitectureNodeType } from './types'

// Invisible connection points: diagrams are read-only, edges just need anchors.
const handleClass = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent'
// Design mode: visible, grabbable dots on every side.
const editHandleClass =
  '!size-2.5 !min-h-0 !min-w-0 !border !border-border-strong !bg-surface transition-colors hover:!border-accent hover:!bg-accent'

const statusFrame = {
  healthy: 'border-border-strong',
  warning: 'border-warning/60',
  degraded: 'border-degraded/60',
  failed: 'border-failed/70 bg-failed/[0.06] shadow-[0_0_0_3px_color-mix(in_oklab,var(--failed)_15%,transparent)]',
  offline: 'border-dashed border-border-strong bg-surface-2/60',
  recovering: 'border-info/60',
  'circuit-open': 'border-warning/70 border-dashed bg-warning/[0.05]',
} as const

/**
 * A service, module or infrastructure component. Status is shown by border,
 * a status dot, an icon and a text label, so it never relies on color alone.
 */
export const ArchitectureNode = memo(function ArchitectureNode({ data, selected }: NodeProps<ArchitectureNodeType>) {
  const Icon = kindIcons[data.kind]
  const meta = statusMeta[data.status]
  const StatusIcon = meta.icon
  const dimmed = data.status === 'offline'
  const editable = !!data.editable
  const hc = editable ? editHandleClass : handleClass

  return (
    <div
      className={cn(
        'w-[200px] rounded-lg border bg-surface text-left shadow-sm transition-[border-color,background-color,box-shadow] duration-300',
        statusFrame[data.status],
        selected && 'ring-2 ring-accent/70 ring-offset-2 ring-offset-bg',
      )}
    >
      <Handle id="top" type="target" position={Position.Top} className={hc} isConnectable={editable} />
      <Handle id="left-in" type="target" position={Position.Left} className={hc} isConnectable={editable} />
      <Handle id="left-out" type="source" position={Position.Left} className={hc} isConnectable={editable} />
      <Handle id="right" type="source" position={Position.Right} className={hc} isConnectable={editable} />
      <Handle id="right-in" type="target" position={Position.Right} className={hc} isConnectable={editable} />
      <div className={cn('flex items-center gap-2 px-3 pt-2.5', dimmed && 'opacity-60')}>
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-border bg-surface-2 text-fg-muted">
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight text-fg">{data.label}</div>
          {data.subtitle && <div className="truncate font-mono text-[10px] text-fg-subtle">{data.subtitle}</div>}
        </div>
        <StatusDot status={data.status} pulse={data.status === 'failed'} />
      </div>

      <div className={cn('mt-2 flex items-center justify-between gap-2 px-3', dimmed && 'opacity-60')}>
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', meta.text)}>
          <StatusIcon className="size-3" aria-hidden="true" />
          {data.statusLabel ?? meta.label}
        </span>
        {data.stats && (
          <span className="flex gap-2 font-mono text-[10px] text-fg-subtle tabular-nums">
            {data.stats.map((s) => (
              <span key={s.label} title={s.label}>
                {s.value}
              </span>
            ))}
          </span>
        )}
      </div>

      {(data.badges?.length || data.action) && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
          <div className="flex min-w-0 flex-wrap gap-1">
            {data.badges?.map((b) => (
              <span
                key={b}
                className="rounded border border-border bg-surface-2 px-1 py-px font-mono text-[9.5px] text-fg-subtle"
              >
                {b}
              </span>
            ))}
          </div>
          {data.action && (
            <button
              type="button"
              aria-pressed={data.action.pressed}
              aria-label={data.action.ariaLabel}
              onClick={(e) => {
                e.stopPropagation()
                data.action!.onClick()
              }}
              className={cn(
                'nodrag nopan inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium transition-colors',
                data.action.pressed
                  ? 'bg-healthy/10 text-healthy hover:bg-healthy/20'
                  : 'text-fg-subtle hover:bg-failed/10 hover:text-failed',
              )}
            >
              {data.action.pressed ? (
                <Power className="size-3" aria-hidden="true" />
              ) : (
                <PowerOff className="size-3" aria-hidden="true" />
              )}
              {data.action.label}
            </button>
          )}
        </div>
      )}
      {!(data.badges?.length || data.action) && <div className="h-2.5" />}
      <Handle id="bottom" type="source" position={Position.Bottom} className={hc} isConnectable={editable} />
    </div>
  )
})
