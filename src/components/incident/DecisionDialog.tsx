import { useState } from 'react'
import { AlertTriangle, Clock, Layers, Search, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { clock, signedUsd, usd } from '@/lib/incident/format'
import type { ActionView, IncidentView } from '@/lib/incident/session'
import { Eyebrow, Modal } from './shared'

interface DecisionDialogProps {
  action: ActionView
  view: IncidentView
  onCancel: () => void
  onConfirm: (rationale: string) => void
}

/**
 * Last stop before a decision lands. States what it costs and what may go
 * wrong, and asks why: the rationale is stored with the decision in the
 * engine's record and comes back in the postmortem.
 */
export function DecisionDialog({ action, view, onCancel, onConfirm }: DecisionDialogProps) {
  const [rationale, setRationale] = useState('')
  const [tried, setTried] = useState(false)
  const missing = rationale.trim() === ''
  const investigate = action.kind === 'investigate'
  const cost = view.budget.monthlyCost + action.monthlyCost
  const submit = () => {
    setTried(true)
    if (!missing) onConfirm(rationale)
  }
  return (
    <Modal
      onClose={onCancel}
      title={
        <div className="border-b border-border px-5 pt-4 pb-3">
          <Eyebrow>{investigate ? 'Investigate' : 'Decision'} at {clock(view.time)}</Eyebrow>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">{action.title}</h2>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <Eyebrow>Expected effect</Eyebrow>
          <p className="mt-1 text-sm leading-relaxed text-fg">{action.description}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <Fact icon={Clock} label="Takes">
            {action.minutes} min
            <span className="block text-[11px] text-fg-subtle">
              {clock(view.time)} → {clock(Math.min(view.time + action.minutes, view.maxTime))}
            </span>
          </Fact>
          <Fact icon={Wallet} label="Cost">
            {action.monthlyCost === 0 ? 'No change' : `${signedUsd(action.monthlyCost)}/mo`}
            {action.monthlyCost !== 0 && view.budget.limit !== null && (
              <span className={cost > view.budget.limit ? 'block text-[11px] text-failed' : 'block text-[11px] text-fg-subtle'}>
                {usd(cost)} of {usd(view.budget.limit)}
              </span>
            )}
          </Fact>
          <Fact icon={Layers} label="Complexity">
            {action.complexity === 0 ? 'No change' : `${action.complexity > 0 ? '+' : ''}${action.complexity}`}
            {view.complexity.limit !== null && action.complexity !== 0 && (
              <span className="block text-[11px] text-fg-subtle">
                {view.complexity.score + action.complexity} of {view.complexity.limit}
              </span>
            )}
          </Fact>
        </dl>
        {investigate ? (
          <div className="rounded-md border border-info/30 bg-info/5 p-3 text-[13px] text-fg">
            <p className="flex items-center gap-1.5 font-medium">
              <Search className="size-3.5 text-info" aria-hidden="true" />
              While you investigate
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
              <li>Takes ~{action.minutes} minutes</li>
              <li>Traffic keeps changing</li>
              <li>No architecture changes</li>
            </ul>
            {action.reveals.length > 0 && <p className="mt-1.5 text-xs text-fg-subtle">You will learn: {action.reveals.join(', ')}.</p>}
          </div>
        ) : (
          action.risks.length > 0 && (
            <div>
              <Eyebrow>Potential risks</Eyebrow>
              <ul className="mt-1 space-y-1">
                {action.risks.map((risk) => (
                  <li key={risk} className="flex gap-1.5 text-[13px] text-fg">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
        <div>
          <label htmlFor="rationale" className="text-sm font-medium text-fg">
            Why are you doing this?
          </label>
          <p className="text-xs text-fg-subtle">Required. It is recorded with the decision and shown in the postmortem.</p>
          <textarea
            id="rationale"
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            rows={3}
            aria-invalid={tried && missing}
            aria-describedby={tried && missing ? 'rationale-error' : undefined}
            placeholder={investigate ? 'e.g. I need to know if the database is the bottleneck before spending money' : 'e.g. Reads dominate, so a cache should take load off PostgreSQL'}
            className="mt-1.5 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
          {tried && missing && (
            <p id="rationale-error" role="alert" className="mt-1 text-xs text-failed">
              Write down your reasoning before you commit.
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} className={missing ? 'opacity-60' : undefined}>
          {investigate ? 'Investigate' : 'Commit decision'}
        </Button>
      </div>
    </Modal>
  )
}

function Fact({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[11px] text-fg-subtle">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[13px] text-fg">{children}</dd>
    </div>
  )
}
