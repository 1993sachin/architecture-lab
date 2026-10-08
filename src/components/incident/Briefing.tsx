import { AlertTriangle, Clock, Eye, EyeOff, Scale, Search, Wallet } from 'lucide-react'
import type { Scenario } from '@architecture-lab/engine'
import { Button } from '@/components/ui/Button'
import { clock, usd } from '@/lib/incident/format'
import type { IncidentView } from '@/lib/incident/session'
import { Eyebrow } from './shared'

/**
 * The first screen. Sets up the role before anything is on fire: you are on
 * call, you will not see everything, and every move costs time and money.
 */
export function Briefing({ scenario, view, onStart }: { scenario: Scenario; view: IncidentView; onStart: () => void }) {
  const budget = view.budget.limit
  const slos = scenario.initialState.constraints.filter((constraint) => constraint.kind === 'metric')
  const points = [
    { icon: AlertTriangle, title: 'You are on call', text: 'When the page fires, the incident is yours. Nobody else is going to make the call.' },
    { icon: EyeOff, title: 'You cannot see everything', text: `${view.unknown.length} things about your own system are unknown until you investigate. You will have to decide with what you can see.` },
    { icon: Search, title: 'You can investigate', text: 'Investigating takes a couple of minutes and changes nothing. It turns unknowns into facts.' },
    { icon: Clock, title: 'Time keeps moving', text: 'Each decision takes time. Traffic keeps changing while you think and while you act.' },
    { icon: Wallet, title: 'Everything costs money', text: budget === null ? 'Every change adds to the monthly bill.' : `Every change adds to a monthly budget of ${usd(budget)}. Finance is watching.` },
    { icon: Scale, title: 'There is no single right answer', text: 'Different moves trade users served, cost and complexity. The postmortem shows what yours cost.' },
  ]
  return (
    <div className="mx-auto max-w-3xl py-6">
      <Eyebrow className="text-accent">On-call briefing · {clock(view.time)}</Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">{scenario.title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
        You are the on-call engineer for a web service: users, an API gateway, an application cluster and one PostgreSQL database. It is quiet. It will not stay quiet.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
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
      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <Eyebrow>Your service level objectives</Eyebrow>
        <ul className="mt-2 space-y-1 text-sm text-fg">
          {slos.map((slo) => (
            <li key={slo.id} className="flex items-center gap-2">
              <Eye className="size-3.5 text-fg-subtle" aria-hidden="true" />
              {slo.description}
              {slo.kind === 'metric' && <span className="font-mono text-xs text-fg-subtle">({slo.bound === 'max' ? '≤' : '≥'} {slo.metric === 'availability' ? `${slo.limit * 100}%` : `${slo.limit} ms`})</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" onClick={onStart}>
          Start your shift
        </Button>
        <p className="text-xs text-fg-subtle">The incident lasts {view.maxTime} simulated minutes. Nothing moves until you act.</p>
      </div>
    </div>
  )
}

