import { Fragment } from 'react'
import { m } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { percent } from '@/lib/incident/format'
import type { TopologyNode, TopologyView as Topology } from '@/lib/incident/session'
import { Eyebrow, HEALTH_DOT } from './shared'

/**
 * A read-only picture of the system, top to bottom in request order. Not an
 * editor: it changes only when a decision adds or removes a component.
 */
export function TopologyView({ topology, title = 'Your system' }: { topology: Topology; title?: string }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-surface p-3">
      <Eyebrow className="mb-2">{title}</Eyebrow>
      <div className="flex flex-col items-center gap-1">
        {topology.rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <ArrowDown className="size-3.5 text-fg-subtle" aria-hidden="true" />}
            <div className="flex w-full flex-wrap justify-center gap-2">
              {row.map((node) => (
                <Node key={node.id} node={node} />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  )
}

function Node({ node }: { node: TopologyNode }) {
  const load = node.utilization
  const strained = load !== null && load > 1
  const busy = load !== null && load > 0.85
  const dot = strained ? 'bg-failed' : busy ? 'bg-warning' : (HEALTH_DOT[node.health] ?? 'bg-fg-subtle')
  return (
    <m.div
      layout
      initial={node.isNew ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      data-testid={`node-${node.id}`}
      className={cn(
        'min-w-32 rounded-md border px-2.5 py-1.5 text-center',
        node.isNew ? 'border-accent/50 bg-accent-soft' : 'border-border bg-surface-2',
        strained && 'border-failed/50',
      )}
    >
      <p className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-fg">
        <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
        {node.label}
        {node.instances > 1 && <span className="font-mono text-[11px] text-fg-subtle">×{node.instances}</span>}
      </p>
      <p className="font-mono text-[10px] text-fg-subtle">
        {node.health !== 'healthy' ? node.health : load === null ? (node.type === 'client' ? 'traffic source' : 'load unknown') : `${percent(load, 0)} load`}
        {node.isNew && ' · new'}
      </p>
    </m.div>
  )
}
