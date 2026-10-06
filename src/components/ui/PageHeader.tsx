import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-2 font-mono text-xs tracking-wide text-accent uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  )
}

export function SectionHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="max-w-2xl">
      {eyebrow && <p className="mb-2 font-mono text-xs tracking-wide text-fg-subtle uppercase">{eyebrow}</p>}
      <h2 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h2>
      {description && <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{description}</p>}
    </div>
  )
}
