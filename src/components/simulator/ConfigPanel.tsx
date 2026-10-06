import { useId } from 'react'
import { ArrowLeftRight, Copy, MousePointerClick, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  COMPONENT_BY_TYPE,
  type Challenge,
  type ComponentConfig,
  type DesignEdge,
  type DesignNode,
  type Insight,
  type ValidationIssue,
} from '@/lib/architecture'
import { kindIcons } from '@/components/architecture/kindIcons'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Switch } from '@/components/ui/Switch'
import { KIND_OF } from './palette'

interface ConfigPanelProps {
  challenge: Challenge
  node: DesignNode | null
  edge: DesignEdge | null
  nodes: DesignNode[]
  issues: ValidationIssue[]
  insights: Array<Insight & { kind: string }>
  onUpdate: (patch: Partial<Pick<DesignNode, 'label' | 'type'>> & { config?: ComponentConfig }) => void
  onDelete: () => void
  onDuplicate: () => void
  onDeleteEdge: () => void
  onReverseEdge: () => void
}

const opts = <const T extends string>(...pairs: ReadonlyArray<readonly [T, string]>) =>
  pairs.map(([value, label]) => ({ value, label }))

/**
 * Settings for the selected component. Deliberately few: each one exists
 * because a rule reasons about it.
 */
export function ConfigPanel(props: ConfigPanelProps) {
  const { node, edge } = props
  if (edge) return <EdgeConfig {...props} edge={edge} />
  if (!node) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-10 text-center text-[13px] text-fg-subtle">
        <MousePointerClick className="size-5" aria-hidden="true" />
        Select a component or a connection to configure it.
      </div>
    )
  }
  return <NodeConfig {...props} node={node} />
}

function NodeConfig({
  challenge,
  node,
  issues,
  insights,
  onUpdate,
  onDelete,
  onDuplicate,
}: ConfigPanelProps & { node: DesignNode }) {
  const def = COMPONENT_BY_TYPE[node.type]
  const Icon = kindIcons[KIND_OF[node.type]]
  const nameId = useId()
  const listId = useId()
  const c = node.config
  const set = (config: ComponentConfig) => onUpdate({ config })
  const isCompute = ['service', 'worker', 'function', 'webapp'].includes(node.type)
  const scalable = ['service', 'worker', 'webapp', 'gateway', 'loadBalancer'].includes(node.type)
  const isDb = node.type === 'sql' || node.type === 'nosql'

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">{def.label}</div>
          <p className="text-xs text-fg-subtle">{def.description}</p>
        </div>
      </div>

      <div>
        <label htmlFor={nameId} className="mb-1.5 block text-xs font-medium text-fg-subtle">
          Name
        </label>
        <input
          id={nameId}
          value={node.label}
          maxLength={40}
          list={isCompute ? listId : undefined}
          onChange={(e) => onUpdate({ label: e.target.value })}
          onBlur={(e) => {
            if (!e.target.value.trim()) onUpdate({ label: def.label })
          }}
          className="h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        />
        {isCompute && (
          <datalist id={listId}>
            {challenge.services.map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>
        )}
        {isCompute && challenge.services.length > 0 && (
          <p className="mt-1 text-[11px] text-fg-subtle">Name it after what it does, e.g. {challenge.services[0].name}.</p>
        )}
      </div>

      {isDb && (
        <SegmentedControl
          label="Type"
          options={opts(['sql', 'SQL'], ['nosql', 'NoSQL'])}
          value={node.type}
          onChange={(type) => onUpdate({ type })}
        />
      )}

      {scalable && (
        <SegmentedControl
          label="Instances"
          options={opts(['1', '1'], ['2', '2'], ['3', '3'], ['5', '5'], ['10', '10'])}
          value={String(c.instances ?? 1)}
          onChange={(v) => set({ instances: Number(v) })}
        />
      )}
      {(node.type === 'service' || node.type === 'worker' || node.type === 'webapp') && (
        <Switch
          label="Autoscaling"
          description="Add instances as load grows."
          checked={!!c.autoscaling}
          onChange={(v) => set({ autoscaling: v })}
        />
      )}
      {node.type === 'service' && (
        <>
          <SegmentedControl
            label="CPU capacity"
            options={opts(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'])}
            value={c.cpu ?? 'medium'}
            onChange={(cpu) => set({ cpu })}
          />
          <SegmentedControl
            label="Client connections"
            options={opts(['http', 'HTTP'], ['websocket', 'WebSocket'])}
            value={c.protocol ?? 'http'}
            onChange={(protocol) => set({ protocol })}
          />
        </>
      )}

      {isDb && (
        <>
          <SegmentedControl
            label="Read capacity"
            options={opts(['low', 'Low'], ['medium', 'Medium'], ['high', 'High'])}
            value={c.readCapacity ?? 'medium'}
            onChange={(readCapacity) => set({ readCapacity })}
          />
          <SegmentedControl
            label="Write capacity"
            options={opts(['low', 'Low'], ['medium', 'Medium'], ['high', 'High'])}
            value={c.writeCapacity ?? 'medium'}
            onChange={(writeCapacity) => set({ writeCapacity })}
          />
        </>
      )}
      {(isDb || ['cache', 'objectStorage', 'search'].includes(node.type)) && (
        <SegmentedControl
          label="Replication"
          options={
            isDb
              ? opts(['none', 'None'], ['replicas', 'Replicas'], ['multi-region', 'Multi-region'])
              : opts(['none', 'None'], ['replicas', 'Replicas'])
          }
          value={c.replication ?? 'none'}
          onChange={(replication) => set({ replication })}
        />
      )}
      {isDb && (
        <SegmentedControl
          label="Regions"
          options={opts(['1', '1'], ['2', '2'], ['3', '3'])}
          value={String(c.regions ?? 1)}
          onChange={(v) => set({ regions: Number(v) })}
        />
      )}

      {node.type === 'cache' && (
        <>
          <SegmentedControl
            label="TTL"
            options={opts(['60', '1 min'], ['300', '5 min'], ['3600', '1 h'], ['86400', '1 day'])}
            value={String(c.ttl ?? 300)}
            onChange={(v) => set({ ttl: Number(v) })}
          />
          <SegmentedControl
            label="Cache strategy"
            options={opts(['cache-aside', 'Aside'], ['write-through', 'Write-through'], ['write-back', 'Write-back'])}
            value={c.cacheStrategy ?? 'cache-aside'}
            onChange={(cacheStrategy) => set({ cacheStrategy })}
          />
          <SegmentedControl
            label="Eviction policy"
            options={opts(['lru', 'LRU'], ['lfu', 'LFU'], ['ttl', 'TTL only'])}
            value={c.eviction ?? 'lru'}
            onChange={(eviction) => set({ eviction })}
          />
        </>
      )}

      {node.type === 'cdn' && (
        <>
          <SegmentedControl
            label="Edge regions"
            options={opts(['1', '1'], ['3', '3'], ['6', '6'])}
            value={String(c.regions ?? 3)}
            onChange={(v) => set({ regions: Number(v) })}
          />
          <SegmentedControl
            label="Cache TTL"
            options={opts(['300', '5 min'], ['3600', '1 h'], ['86400', '1 day'])}
            value={String(c.ttl ?? 3600)}
            onChange={(v) => set({ ttl: Number(v) })}
          />
        </>
      )}

      {Object.keys(def.defaults).length === 0 && node.type !== 'client' && (
        <p className="text-xs text-fg-subtle">Managed component: no settings that change the evaluation.</p>
      )}

      {(issues.length > 0 || insights.length > 0) && (
        <div className="space-y-1.5 border-t border-border pt-4">
          <h3 className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">About this component</h3>
          <ul className="space-y-1.5 text-xs">
            {issues.map((i) => (
              <li
                key={i.id}
                className={cn(
                  i.severity === 'error' ? 'text-failed' : i.severity === 'warning' ? 'text-degraded' : 'text-fg-muted',
                )}
              >
                {i.message}
              </li>
            ))}
            {insights.map((i) => (
              <li key={`${i.kind}-${i.id}`} className={i.kind === 'strength' ? 'text-healthy' : 'text-degraded'}>
                <span className="font-medium">{i.kind === 'strength' ? '✓ ' : '⚠ '}</span>
                {i.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 border-t border-border pt-4">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onDuplicate}>
          <Copy className="size-3.5" aria-hidden="true" /> Duplicate
        </Button>
        <Button variant="danger" size="sm" className="flex-1" onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden="true" /> Delete
        </Button>
      </div>
    </div>
  )
}

function EdgeConfig({ edge, nodes, issues, onDeleteEdge, onReverseEdge }: ConfigPanelProps & { edge: DesignEdge }) {
  const source = nodes.find((n) => n.id === edge.source)
  const target = nodes.find((n) => n.id === edge.target)
  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">Connection</div>
        <p className="mt-1 text-[13px] text-fg">
          {source?.label} <span className="text-fg-subtle">→</span> {target?.label}
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          {source?.label} sends requests or messages to {target?.label}.
        </p>
      </div>
      {issues.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {issues.map((i) => (
            <li key={i.id} className={i.severity === 'error' ? 'text-failed' : 'text-degraded'}>
              {i.message}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onReverseEdge}>
          <ArrowLeftRight className="size-3.5" aria-hidden="true" /> Reverse
        </Button>
        <Button variant="danger" size="sm" className="flex-1" onClick={onDeleteEdge}>
          <Trash2 className="size-3.5" aria-hidden="true" /> Delete
        </Button>
      </div>
    </div>
  )
}
