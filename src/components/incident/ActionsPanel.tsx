import { FastForward, Hourglass, Search, Wrench } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { signedUsd } from '@/lib/incident/format'
import type { ActionView, IncidentView } from '@/lib/incident/session'
import { Eyebrow } from './shared'

interface ActionsPanelProps {
  view: IncidentView
  onSelect: (id: string) => void
  onWait: (minutes: number) => void
  onFinish: () => void
}

export function ActionsPanel({ view, onSelect, onWait, onFinish }: ActionsPanelProps) {
  const investigate = view.actions.filter((action) => action.kind === 'investigate')
  const change = view.actions.filter((action) => action.kind === 'change')
  return (
    <section aria-labelledby="available-actions" className="rounded-lg border border-border bg-surface p-3">
      <Eyebrow className="mb-2">
        <span id="available-actions">Available actions</span>
      </Eyebrow>
      {investigate.length > 0 && (
        <Group icon={Search} title="Investigate" note="Takes time. Changes nothing.">
          {investigate.map((action) => (
            <ActionButton key={action.id} action={action} onSelect={onSelect} />
          ))}
        </Group>
      )}
      <Group icon={Wrench} title="Change the system" note="Costs money and adds complexity.">
        {change.map((action) => (
          <ActionButton key={action.id} action={action} onSelect={onSelect} />
        ))}
      </Group>
      <Group icon={Hourglass} title="Hold" note="Watch what the system does on its own.">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onWait(1)}>
            Wait 1 min
          </Button>
          <Button size="sm" onClick={() => onWait(5)}>
            Wait 5 min
          </Button>
          <Button size="sm" variant="ghost" onClick={onFinish} title="No more decisions: let the incident play out">
            <FastForward className="size-3.5" aria-hidden="true" />
            Play out to the end
          </Button>
        </div>
      </Group>
    </section>
  )
}

function Group({ icon: Icon, title, note, children }: { icon: typeof Search; title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first-of-type:mt-0" role="group" aria-label={title}>
      <p className="mb-1.5 flex items-baseline gap-1.5 text-xs">
        <Icon className="size-3.5 self-center text-fg-subtle" aria-hidden="true" />
        <span className="font-medium whitespace-nowrap text-fg">{title}</span>
        <span className="text-fg-subtle">{note}</span>
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function ActionButton({ action, onSelect }: { action: ActionView; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      disabled={!action.enabled}
      onClick={() => onSelect(action.id)}
      className={cn(
        'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
        action.enabled ? 'border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3' : 'cursor-not-allowed border-dashed border-border opacity-70',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg">{action.title}</span>
        <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
          {action.minutes} min
          {action.monthlyCost !== 0 && <> · {signedUsd(action.monthlyCost)}/mo</>}
          {action.complexity !== 0 && <> · {action.complexity > 0 ? '+' : ''}{action.complexity} cx</>}
        </span>
      </span>
      {!action.enabled && action.reason && <span className="mt-0.5 block text-xs text-warning">Unavailable: {action.reason}</span>}
      {action.timesTaken > 0 && action.enabled && <span className="mt-0.5 block text-[11px] text-fg-subtle">Done {action.timesTaken}× already</span>}
    </button>
  )
}
