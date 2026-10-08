import { AlertTriangle, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { clock, metricValue, usd } from '@/lib/incident/format'
import type { ConstraintChange, IncidentView, Transition } from '@/lib/incident/session'
import { Eyebrow, Modal } from './shared'

/** The page: something is wrong, and it is yours. */
export function PageAlert({ view, transition, onAcknowledge }: { view: IncidentView; transition: Transition | null; onAcknowledge: () => void }) {
  return (
    <Modal
      tone="alert"
      label="You have been paged"
      title={
        <div className="flex items-center gap-3 border-b border-failed/40 bg-failed/10 px-5 py-4">
          <BellRing className="size-6 shrink-0 animate-pulse text-failed" aria-hidden="true" />
          <div>
            <Eyebrow className="text-failed">Page · {clock(view.time)}</Eyebrow>
            <h2 className="text-lg font-semibold tracking-tight text-fg">SLO breached. You are on call.</h2>
          </div>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        {transition?.events.map((event) => (
          <p key={event.eventId} className="text-fg">
            <span className="font-medium">{event.title}.</span> <span className="text-fg-muted">{event.description}</span>
          </p>
        ))}
        <ul className="space-y-0.5 font-mono text-[13px]">
          {view.sloBreaches.map((slo) => (
            <li key={slo} className="text-failed">
              ✕ {slo}
            </li>
          ))}
        </ul>
        {transition && transition.deltas.length > 0 && (
          <div>
            <Eyebrow>Since {clock(transition.from)}</Eyebrow>
            <ul className="mt-1 space-y-0.5 font-mono text-[13px]">
              {transition.deltas.map((delta) => (
                <li key={delta.key} className="text-fg">
                  <span className="inline-block w-28 font-sans text-xs text-fg-muted">{delta.label}</span>
                  {delta.before === null ? '?' : metricValue(delta.unit, delta.before)} → <span className={delta.better === false ? 'text-failed' : ''}>{delta.after === null ? '?' : metricValue(delta.unit, delta.after)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-fg-muted">
          The dashboards do not tell you everything. You can investigate first or act now. The clock only moves when you do something, but every move takes time.
        </p>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button variant="danger" onClick={onAcknowledge}>
          Acknowledge and take the incident
        </Button>
      </div>
    </Modal>
  )
}

const KIND_NAME: Record<string, string> = { budget: 'Budget', complexity: 'Complexity limit', metric: 'SLO' }

/** A rule of the game changed mid-incident. Not a toast. */
export function ConstraintAlert({ change, view, onDismiss }: { change: ConstraintChange; view: IncidentView; onDismiss: () => void }) {
  const name = KIND_NAME[change.kind] ?? change.constraintId
  const money = change.kind === 'budget'
  const show = (value: number | null) => (value === null ? 'none' : money ? `${usd(value)}/mo` : String(value))
  const headroom = change.after === null ? null : change.after - change.monthlyCost
  return (
    <Modal
      tone="warning"
      onClose={onDismiss}
      label={`New constraint: ${name}`}
      title={
        <div className="flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-5 py-4">
          <AlertTriangle className="size-6 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <Eyebrow className="text-warning">⚠ New constraint · {clock(change.time)}</Eyebrow>
            <h2 className="text-lg font-semibold tracking-tight text-fg">{change.cause?.title ?? `${name} changed`}</h2>
          </div>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        {change.cause && <p className="text-fg-muted">{change.cause.description}</p>}
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border bg-surface-2 p-2.5">
            <dt className="text-[11px] text-fg-subtle">{name}</dt>
            <dd className="font-mono text-[13px] text-fg">
              <s className="text-fg-subtle">{show(change.before)}</s> → <span className="font-semibold">{show(change.after)}</span>
            </dd>
          </div>
          {money && (
            <>
              <div className="rounded-md border border-border bg-surface-2 p-2.5">
                <dt className="text-[11px] text-fg-subtle">Current cost</dt>
                <dd className="font-mono text-[13px] text-fg">{usd(change.monthlyCost)}/mo</dd>
              </div>
              <div className={`rounded-md border p-2.5 ${headroom !== null && headroom < 0 ? 'border-failed/50 bg-failed/10' : 'border-border bg-surface-2'}`}>
                <dt className="text-[11px] text-fg-subtle">Headroom</dt>
                <dd className={`font-mono text-[13px] font-semibold ${headroom !== null && headroom < 0 ? 'text-failed' : 'text-healthy'}`}>
                  {headroom === null ? '—' : headroom < 0 ? `${usd(-headroom)} over` : `${usd(headroom)} left`}
                </dd>
              </div>
            </>
          )}
        </dl>
        <p className="text-xs text-fg-subtle">{change.description}</p>
        {view.actions.length > 0 && headroom !== null && headroom < 0 && <p className="text-fg">You are over the new limit. Every minute you stay over is recorded and shows up in the postmortem.</p>}
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button variant="primary" onClick={onDismiss}>
          Understood
        </Button>
      </div>
    </Modal>
  )
}
