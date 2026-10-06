import { Link } from 'react-router-dom'
import { ArrowUpRight, FlaskConical } from 'lucide-react'
import type { ExperimentMeta } from '@/types/experiment'
import { Badge } from '@/components/ui/Badge'

export function ExperimentCard({ experiment }: { experiment: ExperimentMeta }) {
  const Icon = experiment.icon
  return (
    <Link
      to={experiment.path}
      className="group flex h-full flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-2/60"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted transition-colors group-hover:text-accent">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <ArrowUpRight className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-fg">{experiment.title}</h3>
      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-fg-muted">{experiment.summary}</p>
      <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-fg-subtle">
        <FlaskConical className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">{experiment.tryThis}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {experiment.concepts.map((c) => (
          <Badge key={c}>{c}</Badge>
        ))}
      </div>
    </Link>
  )
}
