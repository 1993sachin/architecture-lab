import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'

interface ControlPanelProps {
  title?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** Container for an experiment's controls, split into labelled sections. */
export function ControlPanel({ title = 'Controls', children, footer, className }: ControlPanelProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold text-fg">{title}</h2>
      <div className="flex-1 divide-y divide-border">{children}</div>
      {footer && <div className="flex gap-2 border-t border-border p-3">{footer}</div>}
    </Card>
  )
}

export function ControlSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 px-4 py-4">
      <h3 className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">{title}</h3>
      {children}
    </section>
  )
}
