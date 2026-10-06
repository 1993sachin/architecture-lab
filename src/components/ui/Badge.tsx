import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'healthy' | 'degraded' | 'warning' | 'failed' | 'info'

const tones: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-2 text-fg-muted',
  accent: 'border-accent/30 bg-accent-soft text-accent',
  healthy: 'border-healthy/30 bg-healthy/10 text-healthy',
  degraded: 'border-degraded/30 bg-degraded/10 text-degraded',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  failed: 'border-failed/30 bg-failed/10 text-failed',
  info: 'border-info/30 bg-info/10 text-info',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] leading-none font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
