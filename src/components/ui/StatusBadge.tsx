import { AlertTriangle, CheckCircle2, CircleSlash, Gauge, RefreshCw, Unplug, XCircle, type LucideIcon } from 'lucide-react'
import type { NodeStatus } from '@/types/status'
import { cn } from '@/lib/cn'

/**
 * Every status pairs a color with an icon and a label so state is never
 * communicated by color alone.
 */
export const statusMeta: Record<NodeStatus, { label: string; icon: LucideIcon; text: string; bg: string; border: string }> = {
  healthy: { label: 'Healthy', icon: CheckCircle2, text: 'text-healthy', bg: 'bg-healthy', border: 'border-healthy/40' },
  degraded: { label: 'Degraded', icon: Gauge, text: 'text-degraded', bg: 'bg-degraded', border: 'border-degraded/40' },
  warning: { label: 'Warning', icon: AlertTriangle, text: 'text-warning', bg: 'bg-warning', border: 'border-warning/40' },
  failed: { label: 'Failed', icon: XCircle, text: 'text-failed', bg: 'bg-failed', border: 'border-failed/50' },
  offline: { label: 'Offline', icon: CircleSlash, text: 'text-offline', bg: 'bg-offline', border: 'border-offline/40' },
  recovering: { label: 'Recovering', icon: RefreshCw, text: 'text-info', bg: 'bg-info', border: 'border-info/40' },
  'circuit-open': { label: 'Circuit open', icon: Unplug, text: 'text-warning', bg: 'bg-warning', border: 'border-warning/50' },
}

export function StatusDot({ status, pulse = false, className }: { status: NodeStatus; pulse?: boolean; className?: string }) {
  const meta = statusMeta[status]
  return (
    <span className={cn('relative inline-flex size-2', className)} aria-hidden="true">
      {pulse && <span className={cn('absolute inset-0 rounded-full animate-pulse-ring', meta.bg)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', meta.bg)} />
    </span>
  )
}

export function StatusBadge({ status, className }: { status: NodeStatus; className?: string }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', meta.text, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  )
}
