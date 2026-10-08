import { useState } from 'react'
import { ChevronDown, FastForward, Hourglass } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { signedUsd } from '@/lib/incident/format'
import { groupActions, intentOf } from '@/lib/incident/intents'
import type { YourMove } from '@/lib/incident/reasoning'
import type { ActionView, IncidentView } from '@/lib/incident/session'
import { Eyebrow } from './shared'

interface ActionsPanelProps {
  view: IncidentView
  move: YourMove | null
  /** Early on, every action shows what it is for; later that sits behind a toggle. */
  explain: boolean
  onSelect: (id: string) => void
  onWait: (minutes: number) => void
  onFinish: () => void
}

/** The decision cue, then the actions grouped by what they try to accomplish. */
export function ActionsPanel({ view, move, explain, onSelect, onWait, onFinish }: ActionsPanelProps) {
  return (
    <section aria-labelledby="available-actions" className="rounded-lg border border-border bg-surface">
      {move && (
        <div className="rounded-t-lg border-b border-accent/40 bg-accent-soft px-4 py-3" data-testid="your-move">
          <Eyebrow className="text-accent">Your move</Eyebrow>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg">{move.framing}</p>
          <p className="mt-1 text-[14px] font-semibold text-fg">{move.question}</p>
        </div>
      )}
      <div className="p-3">
        <Eyebrow className="mb-2">
          <span id="available-actions">Available actions</span>
        </Eyebrow>
        {groupActions(view.actions).map(({ group, actions }) => (
          <div key={group.id} className="mt-3 first-of-type:mt-0" role="group" aria-label={group.title}>
            <p className="mb-1.5 text-xs">
              <span className="font-semibold text-fg">{group.title}</span> <span className="text-fg-subtle">{group.note}</span>
            </p>
            <div className="space-y-1.5">
              {actions.map((action) => (
                <ActionButton key={action.id} action={action} explain={explain} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
        <div className="mt-3" role="group" aria-label="Hold">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs">
            <Hourglass className="size-3.5 text-fg-subtle" aria-hidden="true" />
            <span className="font-semibold text-fg">Hold</span> <span className="text-fg-subtle">Watch what the system does on its own.</span>
          </p>
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
        </div>
      </div>
    </section>
  )
}

function ActionButton({ action, explain, onSelect }: { action: ActionView; explain: boolean; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const intent = intentOf(action)
  const details = intent.helpsIf || intent.mayNotHelpIf || (intent.tradeOffs?.length ?? 0) > 0
  return (
    <div className={cn('rounded-md border', action.enabled ? 'border-border bg-surface-2' : 'border-dashed border-border opacity-70')}>
      <button
        type="button"
        disabled={!action.enabled}
        onClick={() => onSelect(action.id)}
        className={cn('w-full rounded-md px-2.5 py-2 text-left transition-colors', action.enabled ? 'hover:bg-surface-3' : 'cursor-not-allowed')}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-fg">{action.title}</span>
          <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
            {action.minutes} min
            {action.monthlyCost !== 0 && <> · {signedUsd(action.monthlyCost)}/mo</>}
            {action.complexity !== 0 && <> · {action.complexity > 0 ? '+' : ''}{action.complexity} cx</>}
          </span>
        </span>
        {(explain || action.kind === 'investigate') && <span className="mt-0.5 block text-[12px] leading-snug text-fg-muted">{intent.purpose}</span>}
        {!action.enabled && action.reason && <span className="mt-0.5 block text-xs text-warning">Unavailable: {action.reason}</span>}
        {action.timesTaken > 0 && action.enabled && <span className="mt-0.5 block text-[11px] text-fg-subtle">Done {action.timesTaken}× already</span>}
      </button>
      {details && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center gap-1 border-t border-border/60 px-2.5 py-1 text-left text-[11px] text-fg-subtle hover:text-fg"
          >
            <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            {explain ? 'When it helps, and the trade-offs' : `What it’s for · ${lowerFirst(intent.purpose.replace(/\.$/, ''))}`}
          </button>
          {open && <IntentDetails action={action} />}
        </>
      )}
    </div>
  )
}

/** Helps if / may not help if / trade-offs, shared with the decision dialog. */
export function IntentDetails({ action, className }: { action: Pick<ActionView, 'id' | 'kind' | 'description'>; className?: string }) {
  const intent = intentOf(action)
  return (
    <dl className={cn('space-y-1 px-2.5 pb-2 text-[12px] leading-snug', className)}>
      {intent.helpsIf && (
        <div>
          <dt className="inline font-medium text-healthy">Helps if: </dt>
          <dd className="inline text-fg-muted">{intent.helpsIf}</dd>
        </div>
      )}
      {intent.mayNotHelpIf && (
        <div>
          <dt className="inline font-medium text-warning">May not help if: </dt>
          <dd className="inline text-fg-muted">{intent.mayNotHelpIf}</dd>
        </div>
      )}
      {intent.tradeOffs && intent.tradeOffs.length > 0 && (
        <div>
          <dt className="inline font-medium text-fg">Trade-offs: </dt>
          <dd className="inline text-fg-muted">{intent.tradeOffs.join(' · ')}</dd>
        </div>
      )}
    </dl>
  )
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
