import { Suspense, lazy } from 'react'
import { ArrowRight, BellRing, ClipboardCheck, Clock, EyeOff, GitFork, Scale, Search, Shuffle, Siren, Wrench } from 'lucide-react'
import { m } from 'framer-motion'
import { playground } from '@/data/experiments'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ButtonLink } from '@/components/ui/Button'
import { SectionHeading } from '@/components/ui/PageHeader'
import { ExperimentCard } from '@/components/home/ExperimentCard'

// The preview runs the real engine; loading it separately keeps the first paint light.
const IncidentPreview = lazy(() => import('@/components/home/IncidentPreview'))

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: 'easeOut' },
} as const

const LOOP = [
  { icon: BellRing, title: 'Get paged', body: 'An SLO breaks. The clock is already running.' },
  { icon: Search, title: 'Investigate', body: 'Some facts are hidden until you look. Looking costs minutes.' },
  { icon: Wrench, title: 'Decide', body: 'Change the system, and write down why.' },
  { icon: Shuffle, title: 'Adapt', body: 'Traffic keeps moving. The budget can change mid-incident.' },
  { icon: ClipboardCheck, title: 'Review', body: 'A postmortem shows what your calls cost, next to other strategies.' },
]

const WHY = [
  { icon: Clock, title: 'Time moves', body: 'Every investigation and every change takes simulated minutes while traffic keeps climbing.' },
  { icon: EyeOff, title: 'Information is incomplete', body: 'Key facts about your own system are unknown until you go and find them.' },
  { icon: GitFork, title: 'Decisions have consequences', body: 'Some land immediately, some minutes later, and some collide with what happens next.' },
  { icon: Scale, title: 'There is no single answer', body: 'Many strategies work. Each one trades users served, cost and complexity differently.' },
]

export default function Home() {
  useDocumentTitle()

  return (
    <>
      {/* Hero: the product in one screen. */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          aria-hidden="true"
        />
        <div className="container-page relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
          <m.div {...fadeUp}>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-fg-muted">
              <span className="size-1.5 rounded-full bg-failed" aria-hidden="true" />
              Incident practice for software engineers
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              You’re on call.
              <br />
              Traffic just went 10×.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-fg-muted">
              Practice engineering judgment under pressure. Decide with incomplete information while the clock runs, then watch a
              deterministic simulation play out the consequences of every call you made.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/incident" variant="primary" size="lg">
                <Siren className="size-4" aria-hidden="true" /> Start the incident
              </ButtonLink>
              <ButtonLink to="/playground" variant="ghost" size="lg">
                Warm up in the Playground <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
            <p className="mt-3 text-[13px] text-fg-subtle">No sign-up. Runs entirely in your browser. Same decisions, same outcome.</p>
          </m.div>
          <m.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
            <Suspense fallback={<div className="h-80 rounded-xl border border-border bg-surface" aria-hidden="true" />}>
              <IncidentPreview />
            </Suspense>
          </m.div>
        </div>
      </section>

      {/* How it works: the incident loop. */}
      <section className="container-page py-16 sm:py-20" aria-labelledby="how">
        <div id="how">
          <SectionHeading eyebrow="How it works" title="One incident, played as a series of decisions" />
        </div>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LOOP.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-fg-subtle">0{index + 1}</span>
                <Icon className="size-4 text-accent" aria-hidden="true" />
              </div>
              <p className="mt-2 text-[15px] font-semibold text-fg">{title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why */}
      <section className="border-y border-border bg-surface/40" aria-labelledby="why">
        <div className="container-page grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_2fr]">
          <div id="why">
            <SectionHeading
              eyebrow="Why Architecture Lab?"
              title="Not “what would you build?” but “what do you do when it breaks?”"
            />
            <p className="mt-4 text-[14px] leading-relaxed text-fg-muted">
              A diagram tool shows what you drew. A chatbot tells you what it would do. Here, a simulation shows you what your decision
              actually did.
            </p>
            <ButtonLink to="/incident" variant="primary" size="md" className="mt-6">
              <Siren className="size-4" aria-hidden="true" /> Start the incident
            </ButtonLink>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {WHY.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3 rounded-lg border border-border bg-surface p-4">
                <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-fg">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Supporting: the concept sandboxes. */}
      <section className="container-page py-16 sm:py-20" aria-labelledby="concepts">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div id="concepts">
            <SectionHeading
              eyebrow="Playground"
              title="Learn the concepts behind the incidents"
              description="No clock, no pressure. Small sandboxes for the patterns you will reach for on call."
            />
          </div>
          <ButtonLink to="/playground" variant="ghost" size="sm" className="self-start sm:self-auto">
            Open the Playground <ArrowRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        </div>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {playground.map((exp) => (
            <li key={exp.id}>
              <ExperimentCard experiment={exp} />
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
