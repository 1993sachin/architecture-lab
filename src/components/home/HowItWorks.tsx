import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, MousePointerClick, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion'

interface Step {
  id: string
  title: string
  body: string
  caption: string
  visual: ReactNode
}

const MODULES = ['Workspace', 'Content', 'Analytics']

function Module({ label, down, pressing }: { label: string; down?: boolean; pressing?: boolean }) {
  return (
    <div
      className={cn(
        'relative flex flex-1 flex-col gap-1 rounded-md border px-2.5 py-2',
        down ? 'border-failed/50 bg-failed/10' : 'border-border bg-surface',
      )}
    >
      <span className="text-[12px] font-medium text-fg">{label}</span>
      <span className={cn('inline-flex items-center gap-1 font-mono text-[10px]', down ? 'text-failed' : 'text-healthy')}>
        {down ? <X className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}
        {down ? 'offline' : 'serving'}
      </span>
      {pressing && <MousePointerClick className="absolute -right-1.5 -bottom-2 size-4 text-accent" aria-hidden="true" />}
    </div>
  )
}

const STEPS: Step[] = [
  {
    id: 'choose',
    title: 'Choose',
    body: 'Pick an architecture experiment.',
    caption: 'Start with the Microfrontend Playground: three teams, three modules, one page.',
    visual: (
      <div className="grid w-full grid-cols-3 gap-2">
        {['Microfrontends', 'Resilience', 'System design'].map((t, i) => (
          <div
            key={t}
            className={cn(
              'rounded-md border px-2.5 py-3 text-[12px] font-medium',
              i === 0 ? 'border-accent bg-accent-soft text-fg' : 'border-border text-fg-muted',
            )}
          >
            <span className="font-mono text-[10px] text-fg-subtle">0{i + 1}</span>
            <div>{t}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'experiment',
    title: 'Experiment',
    body: 'Change the architecture or introduce failures.',
    caption: 'Take the Workspace module offline, the way a broken deploy would.',
    visual: (
      <div className="flex w-full gap-2">
        <Module label="Workspace" pressing />
        <Module label="Content" />
        <Module label="Analytics" />
      </div>
    ),
  },
  {
    id: 'observe',
    title: 'Observe',
    body: 'Watch the system react.',
    caption: 'Workspace fails, but Content and Analytics keep serving. Availability drops, not to zero.',
    visual: (
      <div className="w-full space-y-2">
        <div className="flex gap-2">
          {MODULES.map((m, i) => (
            <Module key={m} label={m} down={i === 0} />
          ))}
        </div>
        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px]">
          <span className="text-fg-subtle">availability</span>
          <span className="text-degraded">55%</span>
        </div>
      </div>
    ),
  },
  {
    id: 'understand',
    title: 'Understand',
    body: 'See the trade-offs behind the behavior.',
    caption: 'Isolation contained the failure. The price is more deployments and runtime composition to operate.',
    visual: (
      <div className="grid w-full gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-healthy/40 bg-healthy/10 px-2.5 py-2 text-[12px] text-fg">
          <span className="font-mono text-[10px] text-healthy">+ GAINED</span>
          <div>Failure isolation, independent deploys</div>
        </div>
        <div className="rounded-md border border-degraded/40 bg-degraded/10 px-2.5 py-2 text-[12px] text-fg">
          <span className="font-mono text-[10px] text-degraded">− COST</span>
          <div>More moving parts to run and debug</div>
        </div>
      </div>
    ),
  },
]

/** Choose → Experiment → Observe → Understand, shown with a tiny worked example. */
export function HowItWorks() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = usePrefersReducedMotion()
  const tabs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (paused || reduced) return
    const t = window.setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4200)
    return () => window.clearInterval(t)
  }, [paused, reduced])

  const select = (i: number) => {
    setActive(i)
    setPaused(true)
  }
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = (i + d + STEPS.length) % STEPS.length
    select(next)
    tabs.current[next]?.focus()
  }

  const step = STEPS[active]
  return (
    <div onPointerEnter={() => setPaused(true)} onFocus={() => setPaused(true)}>
      <div role="tablist" aria-label="How Architecture Lab works" className="relative grid gap-2 sm:grid-cols-4 sm:gap-0">
        {/* The connecting line behind the step markers. */}
        <span
          aria-hidden="true"
          className="absolute top-[19px] right-[12.5%] left-[12.5%] hidden h-px bg-border-strong sm:block"
        />
        <span aria-hidden="true" className="absolute top-8 bottom-8 left-[28px] w-px bg-border-strong sm:hidden" />
        {STEPS.map((s, i) => {
          const selected = i === active
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el
              }}
              role="tab"
              type="button"
              id={`how-tab-${s.id}`}
              aria-selected={selected}
              aria-controls="how-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="group relative flex items-center gap-3 rounded-md px-2 py-1.5 text-left sm:flex-col sm:items-center sm:gap-2 sm:text-center"
            >
              <span
                className={cn(
                  'relative z-10 inline-flex size-10 shrink-0 items-center justify-center rounded-full border font-mono text-[12px] transition-colors',
                  selected
                    ? 'border-accent bg-accent text-accent-fg'
                    : i < active
                      ? 'border-accent bg-surface text-accent'
                      : 'border-border-strong bg-surface text-fg-subtle group-hover:text-fg',
                )}
              >
                0{i + 1}
              </span>
              <span>
                <span
                  className={cn('block text-[14px] font-semibold', selected ? 'text-fg' : 'text-fg-muted group-hover:text-fg')}
                >
                  {s.title}
                </span>
                <span className="block text-[12.5px] text-fg-subtle">{s.body}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div
        id="how-panel"
        role="tabpanel"
        aria-labelledby={`how-tab-${step.id}`}
        className="mt-6 grid items-center gap-5 rounded-lg border border-border bg-surface p-5 md:grid-cols-[1.2fr_1fr]"
      >
        <div className="flex min-h-[92px] items-center">{step.visual}</div>
        <p className="text-[14px] leading-relaxed text-fg-muted">
          <span className="font-mono text-[11px] text-accent uppercase">
            0{active + 1} · {step.title}
          </span>
          <br />
          {step.caption}
        </p>
      </div>
    </div>
  )
}
