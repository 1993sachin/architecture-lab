import { Clock, EyeOff, Scale, Search, Siren, Target, Wallet } from 'lucide-react'
import type { Scenario } from '@architecture-lab/engine'
import { Button } from '@/components/ui/Button'
import { clock, usd } from '@/lib/incident/format'
import type { IncidentView } from '@/lib/incident/session'
import { Eyebrow } from './shared'

/**
 * Plain-language names for the scenario's objectives. The precise wording
 * underneath is the engine's own description, so the numbers never drift.
 */
const OBJECTIVE_NAME: Record<string, string> = {
  'users-served': 'Keep users served',
  'no-collapse': 'Don’t let the service fall over',
  responsive: 'Keep it fast',
  recovered: 'End the incident healthy',
  'database-headroom': 'Leave the database some headroom',
}

/**
 * The first screen. Four lines set up the role before anything is on fire,
 * then what you will be judged on, then one button. The rest is reference.
 */
export function Briefing({ scenario, view, onStart }: { scenario: Scenario; view: IncidentView; onStart: () => void }) {
  const budget = view.budget.limit
  const { constraints } = scenario.initialState
  const slos = constraints.filter((constraint) => constraint.kind === 'metric')
  const complexity = constraints.find((constraint) => constraint.kind === 'complexity')
  const points = [
    { icon: EyeOff, title: 'You cannot see everything', text: `${view.unknown.length} things about your own system are unknown until you investigate. You will have to decide with what you can see.` },
    { icon: Search, title: 'You can investigate', text: 'Investigating takes a couple of minutes and changes nothing. It turns unknowns into facts.' },
    { icon: Clock, title: 'Time keeps moving', text: 'Each decision takes time. Traffic keeps changing while you think and while you act.' },
    { icon: Wallet, title: 'Everything costs money', text: budget === null ? 'Every change adds to the monthly bill.' : `Every change adds to a monthly budget of ${usd(budget)}. Finance is watching.` },
    { icon: Scale, title: 'There is no single right answer', text: 'Different moves trade users served, cost and complexity. The postmortem shows what yours cost.' },
  ]
  return (
    <div className="mx-auto max-w-3xl py-8 sm:py-10">
      <Eyebrow className="text-accent">
        On-call briefing · {scenario.title} · {clock(view.time)}
      </Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">You’re on call.</h1>
      <div className="mt-4 space-y-1.5 text-[17px] leading-relaxed text-fg">
        <p>A product launch just went live and traffic is climbing.</p>
        <p>You can’t see everything, and every action takes time.</p>
        <p className="font-medium">Investigate or intervene. The incident won’t wait.</p>
      </div>
      <p className="mt-3 text-[13px] text-fg-muted">Your system: users → API gateway → application cluster → one PostgreSQL database.</p>

      <section aria-labelledby="success" className="mt-7 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 id="success" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Target className="size-4 text-accent" aria-hidden="true" />
          What success looks like
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">The incident lasts {view.maxTime} simulated minutes. You are scored on these objectives:</p>
        <ul className="mt-3 space-y-2" aria-label="Objectives">
          {scenario.objectives.map((objective) => (
            <li key={objective.id} className="text-sm">
              <span className="font-medium text-fg">{OBJECTIVE_NAME[objective.id] ?? objective.description}</span>
              {(objective.weight ?? 1) > 1 && <span className="ml-2 rounded border border-accent/40 px-1 py-px font-mono text-[10px] text-accent">counts ×{objective.weight}</span>}
              {OBJECTIVE_NAME[objective.id] && <span className="block text-[13px] text-fg-muted">{objective.description}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-fg-muted">And you should stay within:</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-xs" aria-label="Limits">
          {slos.map((slo) => (
            <li key={slo.id} className="rounded border border-border bg-surface-2 px-2 py-1 text-fg">
              {slo.kind !== 'metric' ? slo.description : slo.metric === 'availability' ? `availability ≥ ${slo.limit * 100}%` : slo.metric === 'p99Latency' ? `p99 ≤ ${slo.limit} ms` : slo.description}
            </li>
          ))}
          {budget !== null && <li className="rounded border border-border bg-surface-2 px-2 py-1 text-fg">budget ≤ {usd(budget)}/mo</li>}
          {complexity && 'limit' in complexity && <li className="rounded border border-border bg-surface-2 px-2 py-1 text-fg">complexity ≤ {complexity.limit}</li>}
        </ul>
      </section>

      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="primary" size="lg" onClick={onStart}>
          <Siren className="size-4" aria-hidden="true" />
          Start the incident
        </Button>
        <p className="text-xs text-fg-subtle">Your shift starts quiet. You will be paged within minutes; from then on, every move you make takes time.</p>
      </div>

      <section aria-labelledby="good-to-know" className="mt-10">
        <h2 id="good-to-know" className="text-sm font-semibold text-fg">
          Good to know
        </h2>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {points.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-fg">{title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
