import type { ReactNode } from 'react'
import { ArrowDown, ArrowRight, Info, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Explainable } from '@/components/ui/Popover'
import { concept as conceptOf, type ConceptId, type EngineeringConcept, type Flow } from '@/lib/learning/concepts'
import { explainMetric, type Reading } from '@/lib/incident/explain'
import type { Chain, Hypothesis } from '@/lib/incident/reasoning'
import type { IncidentView, MetricKey } from '@/lib/incident/session'

/**
 * The learning layer's UI: small info triggers that open an explanation of a
 * metric or a concept, next to the number it explains. Nothing is shown until
 * the operator asks.
 */

const READING_TONE: Record<Reading['tone'], string> = {
  concern: 'border-failed/40 bg-failed/5',
  watch: 'border-warning/40 bg-warning/5',
  fine: 'border-healthy/30 bg-healthy/5',
  unknown: 'border-dashed border-border-strong',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{title}</p>
      <div className="mt-0.5 text-[13px] leading-relaxed text-fg">{children}</div>
    </div>
  )
}

function Example({ lines, live }: { lines: string[]; live: boolean }) {
  if (lines.length === 0) return null
  return (
    <Section title={live ? 'Right now, that means' : 'Example'}>
      <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2 font-mono text-[12px] leading-relaxed">
        <p className="font-semibold text-fg">{lines[0]}</p>
        {lines.slice(1).map((line) => (
          <p key={line} className="text-fg-muted">
            {line}
          </p>
        ))}
      </div>
    </Section>
  )
}

/** A short vertical flow: each step leads to the next. */
export function FlowView({ flow }: { flow: Flow }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-fg">{flow.title}</p>
      <ol className="mt-1 space-y-0.5">
        {flow.steps.map((step, index) => (
          <li key={step} className="text-[12px] text-fg-muted">
            {index > 0 && <ArrowDown className="mb-0.5 ml-1 block size-3 text-fg-subtle" aria-hidden="true" />}
            <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const STEP_TONE: Record<Chain['steps'][number]['tone'], string> = {
  up: 'text-warning',
  down: 'text-failed',
  unknown: 'text-fg-subtle',
  plain: 'text-fg',
}

/** A causal chain with live values; the step the evidence is about is highlighted. */
export function ChainView({ chain, good }: { chain: Chain; good?: boolean }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-fg">{chain.title}</p>
      <ol className="mt-1 flex flex-wrap items-stretch gap-1" aria-label={chain.title}>
        {chain.steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-1">
            {index > 0 && <ArrowRight className="size-3 shrink-0 text-fg-subtle" aria-hidden="true" />}
            <span className={cn('rounded border px-2 py-1', step.focus ? 'border-accent bg-accent-soft ring-1 ring-accent/40' : 'border-border bg-surface')} aria-current={step.focus ? 'step' : undefined}>
              <span className="block text-[11px] text-fg-subtle">{step.label}</span>
              {step.value && <span className={cn('block font-mono text-[12px]', good ? 'text-fg' : STEP_TONE[step.tone])}>{step.value}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MoreAbout({ concept, extra }: { concept: EngineeringConcept; extra?: ReactNode }) {
  const has = (concept.affectedBy?.length ?? 0) > 0 || (concept.improvedBy?.length ?? 0) > 0 || (concept.flows?.length ?? 0) > 0 || extra
  if (!has) return null
  return (
    <details className="group rounded-md border border-border">
      <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[12px] font-medium text-accent [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Learn more: what affects it and how it connects</span>
        <span className="hidden group-open:inline">Less</span>
      </summary>
      <div className="space-y-3 border-t border-border px-2.5 py-2.5">
        {concept.affectedBy && (
          <Section title="What can affect it?">
            <ul className="list-disc space-y-0.5 pl-4 text-fg-muted">
              {concept.affectedBy.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>
        )}
        {concept.improvedBy && (
          <Section title="What can improve it?">
            <ul className="list-disc space-y-0.5 pl-4 text-fg-muted">
              {concept.improvedBy.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>
        )}
        {concept.flows && (
          <div className="grid gap-3 sm:grid-cols-2">
            {concept.flows.map((flow) => (
              <FlowView key={flow.title} flow={flow} />
            ))}
          </div>
        )}
        {extra}
      </div>
    </details>
  )
}

function Caveat({ text }: { text?: string }) {
  if (!text) return null
  return <p className="rounded-md border-l-2 border-accent bg-accent-soft px-2.5 py-1.5 text-[12.5px] leading-relaxed text-fg">{text}</p>
}

/** A concept on its own, for things that are not a single live metric (SLO, budget, complexity). */
export function ConceptBody({ concept, children }: { concept: EngineeringConcept; children?: ReactNode }) {
  return (
    <div className="space-y-3" data-testid={`concept-${concept.id}`}>
      <Section title="What is it?">{concept.what}</Section>
      {concept.example && concept.sample !== undefined && <Example lines={concept.example(concept.sample)} live={false} />}
      <Section title="Why does it matter?">{concept.whyItMatters}</Section>
      {children}
      <Caveat text={concept.caveat} />
      <MoreAbout concept={concept} />
    </div>
  )
}

/** A live metric: what it is, what this value means right now, and why it might be here. */
export function MetricBody({ metricKey, view, causes, onCheck }: { metricKey: MetricKey; view: IncidentView; causes: Hypothesis[]; onCheck?: (actionId: string) => void }) {
  const explanation = explainMetric(metricKey, view, causes)
  const { concept } = explanation
  return (
    <div className="space-y-3" data-testid={`explain-${metricKey}`}>
      <Section title="What is it?">{concept.what}</Section>
      <Example lines={explanation.example} live={explanation.exampleIsLive} />
      <Section title="Why does it matter?">{concept.whyItMatters}</Section>
      {explanation.reading && (
        <div className={cn('rounded-md border px-2.5 py-2', READING_TONE[explanation.reading.tone])}>
          <p className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{explanation.reading.title}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-fg">{explanation.reading.text}</p>
        </div>
      )}
      {explanation.unknown && (
        <div className="rounded-md border border-dashed border-border-strong px-2.5 py-2 text-[13px] leading-relaxed text-fg">
          <p>{explanation.unknown.text}</p>
          {explanation.unknown.check && onCheck && (
            <button type="button" onClick={() => onCheck(explanation.unknown!.check!.actionId)} className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-info hover:underline">
              <Search className="size-3" aria-hidden="true" />
              {explanation.unknown.check.title}
            </button>
          )}
        </div>
      )}
      {explanation.why.length > 0 && (
        <Section title="Why might this be happening?">
          <ul className="list-disc space-y-0.5 pl-4 text-fg-muted">
            {explanation.why.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11.5px] text-fg-subtle">Based only on what you can see. Possibilities, not a diagnosis.</p>
        </Section>
      )}
      <Caveat text={concept.caveat} />
      <MoreAbout
        concept={concept}
        extra={
          <>
            {explanation.chains.map((chain) => (
              <ChainView key={chain.id} chain={chain} />
            ))}
            {explanation.also.map((also) => (
              <Section key={also.id} title={also.title}>
                {also.short} {also.whyItMatters}
              </Section>
            ))}
          </>
        }
      />
    </div>
  )
}

/** Wraps a metric (or just an info icon) so clicking it explains the metric. */
export function LearnMetric({
  metricKey,
  view,
  causes,
  onCheck,
  className,
  children,
}: {
  metricKey: MetricKey
  view: IncidentView
  causes: Hypothesis[]
  onCheck?: (actionId: string) => void
  className?: string
  children?: ReactNode
}) {
  const metric = view.metrics[metricKey]
  const concept = explainMetric(metricKey, view, causes).concept
  const title = metricKey === 'dbCpu' || metricKey === 'appCpu' ? `${metric.label}: ${concept.title.toLowerCase()}` : concept.title
  return (
    <Explainable
      label={`Explain ${metric.label}`}
      title={title}
      hint={concept.short}
      className={className ?? 'rounded p-0.5 text-fg-subtle hover:text-accent'}
      content={() => <MetricBody metricKey={metricKey} view={view} causes={causes} onCheck={onCheck} />}
    >
      {children ?? <Info className="size-3.5" aria-hidden="true" />}
    </Explainable>
  )
}

/** An info icon for a concept that is not one live metric. */
export function LearnConcept({ id, className, children, body }: { id: ConceptId; className?: string; children?: ReactNode; body?: ReactNode }) {
  const concept = conceptOf(id)
  return (
    <Explainable
      label={`Explain ${concept.title}`}
      title={concept.title}
      hint={concept.short}
      className={className ?? 'rounded p-0.5 text-fg-subtle hover:text-accent'}
      content={() => <ConceptBody concept={concept}>{body}</ConceptBody>}
    >
      {children ?? <Info className="size-3.5" aria-hidden="true" />}
    </Explainable>
  )
}
