import { AlertTriangle, CheckCircle2, Lightbulb, XCircle } from 'lucide-react'
import { AnimatePresence, m } from 'framer-motion'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'

type Tone = 'healthy' | 'warning' | 'failed'

const toneMeta = {
  healthy: { icon: CheckCircle2, className: 'text-healthy' },
  warning: { icon: AlertTriangle, className: 'text-degraded' },
  failed: { icon: XCircle, className: 'text-failed' },
} as const

interface ExplanationPanelProps {
  title?: string
  tone: Tone
  headline: string
  details: string[]
  /** Why the most recent change matters. */
  change?: string | null
  className?: string
}

export function ExplanationPanel({ title = 'What is happening?', tone, headline, details, change, className }: ExplanationPanelProps) {
  const meta = toneMeta[tone]
  const Icon = meta.icon
  return (
    <Card className={cn('p-4', className)}>
      <h2 className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">{title}</h2>
      <div aria-live="polite" className="mt-3 flex gap-2.5">
        <Icon className={cn('mt-0.5 size-4 shrink-0', meta.className)} aria-hidden="true" />
        <p className="text-[14px] leading-snug font-medium text-fg">{headline}</p>
      </div>
      <ul className="mt-3 space-y-2 pl-[26px] text-[13px] leading-relaxed text-fg-muted">
        {details.map((d) => (
          <li key={d.slice(0, 40)} className="list-disc marker:text-fg-subtle">
            {d}
          </li>
        ))}
      </ul>
      <AnimatePresence mode="wait">
        {change && (
          <m.div
            key={change}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-4 flex gap-2.5 rounded-md border border-accent/25 bg-accent-soft p-3"
          >
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-[13px] leading-relaxed text-fg">
              <span className="font-medium">Trade-off: </span>
              {change}
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
