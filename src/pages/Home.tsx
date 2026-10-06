import { ArrowRight, Workflow } from 'lucide-react'
import { m } from 'framer-motion'
import { site } from '@/lib/site'
import { experiments } from '@/data/experiments'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ButtonLink } from '@/components/ui/Button'
import { SectionHeading } from '@/components/ui/PageHeader'
import { HeroDiagram } from '@/components/home/HeroDiagram'
import { ExperimentCard } from '@/components/home/ExperimentCard'
import { LoopSteps } from '@/components/home/LoopSteps'

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: 'easeOut' },
} as const

export default function Home() {
  useDocumentTitle()

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden="true" />
        <div className="container-page relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
          <m.div {...fadeUp}>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-fg-muted">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              Interactive architecture playground
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{site.name}</h1>
            <p className="mt-3 font-mono text-[15px] text-accent">{site.tagline}</p>
            <p className="mt-4 max-w-md text-base leading-relaxed text-fg-muted">{site.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/experiments" variant="primary" size="lg">
                Explore Experiments <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink to="/simulator" variant="secondary" size="lg">
                <Workflow className="size-4" aria-hidden="true" /> Design a System
              </ButtonLink>
            </div>
          </m.div>
          <m.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
            <HeroDiagram />
          </m.div>
        </div>
      </section>

      {/* Featured experiments */}
      <section className="container-page py-16 sm:py-20" aria-labelledby="featured">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div id="featured">
            <SectionHeading
              eyebrow="Experiments"
              title="Change a decision. Watch the system react."
              description="Each experiment is a small, live system with controls, metrics and an explanation of the trade-off you just made."
            />
          </div>
          <ButtonLink to="/experiments" variant="ghost" size="sm" className="self-start sm:self-auto">
            All experiments <ArrowRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        </div>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {experiments.map((exp) => (
            <li key={exp.id}>
              <ExperimentCard experiment={exp} />
            </li>
          ))}
        </ul>
      </section>

      {/* Why */}
      <section className="border-y border-border bg-surface/40" aria-labelledby="why">
        <div className="container-page grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_2fr]">
          <div id="why">
            <SectionHeading eyebrow="Why Architecture Lab?" title="Diagrams don’t fail. Systems do." />
          </div>
          <div className="space-y-4 text-[15px] leading-relaxed text-fg-muted">
            <p>
              Most system-design material is a static box-and-arrow diagram plus a list of pros and cons. You can read that a
              circuit breaker prevents cascading failures, but it doesn’t really land until you watch retries pile up against a
              dead service and then see the breaker trip open.
            </p>
            <p>
              Architecture Lab turns those diagrams into small simulations you can poke at. Every control is an architectural
              decision, every metric responds to it, and every change comes with an explanation of the trade-off you just made.
            </p>
          </div>
        </div>
      </section>

      {/* Loop */}
      <section className="container-page py-16 sm:py-20" aria-labelledby="loop">
        <div id="loop">
          <SectionHeading eyebrow="How it works" title="Build → Break → Measure → Understand" />
        </div>
        <div className="mt-8">
          <LoopSteps />
        </div>
      </section>
    </>
  )
}
