import { useMemo } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Flame,
  Lightbulb,
  Minus,
  Pencil,
  Plus,
  Scale,
  Share2,
  ShieldAlert,
  Trophy,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  compareEvaluations,
  diffArchitectures,
  isEmptyDiff,
  type Challenge,
  type Dimension,
  type Insight,
  type InsightSeverity,
} from '@/lib/architecture'
import type { EvaluationRecord } from '@/store/simulatorStore'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface EvaluationResultsProps {
  challenge: Challenge
  current: EvaluationRecord
  previous: EvaluationRecord | null
  /** The design changed since this evaluation. */
  stale: boolean
  shareStatus: string | null
  onFocusNodes: (ids: string[]) => void
  onImprove: () => void
  onShare: () => void
  onDownloadCard: () => void
}

const HINT: Partial<Record<Dimension, string>> = { cost: 'higher = cheaper', complexity: 'higher = simpler' }

const tone = (v: number) => (v >= 7.5 ? 'healthy' : v >= 5 ? 'degraded' : 'failed')
const toneText = { healthy: 'text-healthy', degraded: 'text-degraded', failed: 'text-failed' } as const
const toneBar = { healthy: 'bg-healthy', degraded: 'bg-degraded', failed: 'bg-failed' } as const
const SEVERITY_TONE: Record<InsightSeverity, 'failed' | 'degraded' | 'neutral'> = {
  high: 'failed',
  medium: 'degraded',
  low: 'neutral',
}

export function EvaluationResults(props: EvaluationResultsProps) {
  const { challenge, current, previous, stale, onFocusNodes } = props
  const e = current.evaluation
  const comparison = useMemo(() => {
    if (!previous) return null
    const diff = diffArchitectures(previous.architecture, current.architecture)
    return { diff, cmp: compareEvaluations(previous.evaluation, e, diff) }
  }, [previous, current, e])

  const topRisk = e.weaknesses[0] ?? e.singlePointsOfFailure[0] ?? e.bottlenecks[0]
  const topStrength = e.strengths[0]
  const topImprovement = e.recommendations[0]

  return (
    <div className="space-y-4">
      {stale && (
        <p className="rounded-md border border-degraded/30 bg-degraded/5 px-3 py-2 text-[13px] text-degraded">
          You changed the design since this evaluation. Re-evaluate to see the effect.
        </p>
      )}

      {/* Completion */}
      <Card className="overflow-hidden">
        <div className="grid gap-px bg-border lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="bg-surface p-5 sm:p-6">
            <p className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-accent uppercase">
              <Trophy className="size-3.5" aria-hidden="true" /> Architecture complete
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={cn('font-mono text-5xl font-semibold tracking-tight', toneText[tone(e.overallScore)])}>
                {e.overallScore.toFixed(1)}
              </span>
              <span className="font-mono text-lg text-fg-subtle">/ 10</span>
              {comparison && comparison.cmp.overall.delta !== 0 && (
                <Delta value={comparison.cmp.overall.delta} className="ml-2" />
              )}
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-fg">{e.summary}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Architecture characteristics">
              {e.characteristics.map((c) => (
                <li key={c}>
                  <Badge>{c}</Badge>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-3 text-[13px]">
              {topStrength && (
                <div>
                  <dt className="text-xs text-fg-subtle">Top strength</dt>
                  <dd className="mt-0.5 flex gap-1.5 text-fg">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-healthy" aria-hidden="true" />
                    {topStrength.title}
                  </dd>
                </div>
              )}
              {topRisk && (
                <div>
                  <dt className="text-xs text-fg-subtle">Top risk</dt>
                  <dd className="mt-0.5 flex gap-1.5 text-fg">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-degraded" aria-hidden="true" />
                    {topRisk.title}
                  </dd>
                </div>
              )}
              {topImprovement && (
                <div>
                  <dt className="text-xs text-fg-subtle">Most valuable improvement</dt>
                  <dd className="mt-0.5 flex gap-1.5 text-fg">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                    {topImprovement.title}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={props.onShare}>
                <Share2 className="size-3.5" aria-hidden="true" /> Share My Architecture
              </Button>
              <Button variant="secondary" size="sm" onClick={props.onImprove}>
                <Pencil className="size-3.5" aria-hidden="true" /> Improve Architecture
              </Button>
              <Button variant="ghost" size="sm" onClick={props.onDownloadCard}>
                <Download className="size-3.5" aria-hidden="true" /> Result card (PNG)
              </Button>
              <span className="text-xs text-accent" aria-live="polite">
                {props.shareStatus}
              </span>
            </div>
          </div>

          {/* Social card preview */}
          <div className="flex items-center justify-center bg-surface-2/50 p-5 sm:p-6">
            <figure
              className="w-full max-w-md rounded-lg border border-border-strong bg-bg p-5 shadow-sm"
              aria-label="Shareable result card"
            >
              <p className="font-mono text-[11px] font-semibold tracking-wider text-accent">ARCHITECTURE LAB</p>
              <p className="mt-3 text-[13px] text-fg-muted">I designed a</p>
              <p className="text-lg font-semibold text-fg">{challenge.title}</p>
              <p className="mt-4 text-xs text-fg-subtle">Architecture Score</p>
              <p className="font-mono text-3xl font-semibold text-fg">
                {e.overallScore.toFixed(1)} <span className="text-base text-fg-subtle">/ 10</span>
              </p>
              <dl className="mt-3 space-y-1">
                {(['scalability', 'reliability', 'performance'] as const).map((d) => (
                  <div key={d} className="flex items-center gap-2 text-xs">
                    <dt className="w-24 text-fg-muted">{DIMENSION_LABELS[d]}</dt>
                    <dd className="flex flex-1 items-center gap-2">
                      <span className="h-1.5 flex-1 rounded-full bg-surface-3">
                        <span
                          className={cn('block h-full rounded-full', toneBar[tone(e.scores[d].value)])}
                          style={{ width: `${e.scores[d].value * 10}%` }}
                        />
                      </span>
                      <span className="w-7 text-right font-mono text-fg">{e.scores[d].value.toFixed(1)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <figcaption className="mt-4 text-[13px] font-medium text-fg">Can you design it better?</figcaption>
            </figure>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ScoreBreakdown evaluation={e} previous={previous?.evaluation ?? null} />
        {comparison && <Comparison {...comparison} />}
        {!comparison && <Tradeoffs tradeoffs={e.tradeoffs} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightList
          title="What You Did Well"
          icon={CheckCircle2}
          iconTone="text-healthy"
          items={e.strengths}
          empty="Nothing stands out yet."
          onFocus={onFocusNodes}
        />
        <InsightList
          title="Potential Problems"
          icon={AlertTriangle}
          iconTone="text-degraded"
          items={e.weaknesses}
          empty="No significant problems found."
          onFocus={onFocusNodes}
          severity
        />
        <InsightList
          title="Potential Single Points of Failure"
          icon={ShieldAlert}
          iconTone="text-failed"
          items={e.singlePointsOfFailure}
          empty="Every component on the request path has redundancy."
          onFocus={onFocusNodes}
          severity
        />
        <InsightList
          title="Bottlenecks"
          icon={Flame}
          iconTone="text-warning"
          items={e.bottlenecks}
          empty="No obvious bottlenecks at this scale."
          onFocus={onFocusNodes}
          severity
        />
      </div>

      <Card>
        <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold text-fg">Recommended Improvements</h2>
        {e.recommendations.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-fg-subtle">
            Nothing pressing. Try optimizing for a different goal, such as cost.
          </p>
        ) : (
          <ol className="grid gap-px bg-border md:grid-cols-2">
            {e.recommendations.map((r, i) => (
              <li key={r.id} className="bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-fg-subtle">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="text-[13.5px] font-semibold text-fg">{r.title}</h3>
                  <Badge tone={SEVERITY_TONE[r.severity]} className="ml-auto">
                    {r.severity}
                  </Badge>
                </div>
                <dl className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed">
                  <div>
                    <dt className="inline font-medium text-fg">Problem: </dt>
                    <dd className="inline text-fg-muted">{r.problem}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-fg">Why it matters: </dt>
                    <dd className="inline text-fg-muted">{r.why}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-fg">Consider: </dt>
                    <dd className="inline text-fg-muted">{r.suggestion}</dd>
                  </div>
                </dl>
                <p className="mt-2 font-mono text-[10.5px] text-fg-subtle">
                  improves {r.improves.map((d) => DIMENSION_LABELS[d].toLowerCase()).join(', ')}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {comparison && <Tradeoffs tradeoffs={e.tradeoffs} />}
    </div>
  )
}

function Delta({ value, className }: { value: number; className?: string }) {
  if (Math.abs(value) < 0.05) return <span className={cn('font-mono text-xs text-fg-subtle', className)}>±0</span>
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center font-mono text-xs', up ? 'text-healthy' : 'text-failed', className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {up ? '+' : ''}
      {value.toFixed(1)}
    </span>
  )
}

function ScoreBreakdown({
  evaluation,
  previous,
}: {
  evaluation: EvaluationRecord['evaluation']
  previous: EvaluationRecord['evaluation'] | null
}) {
  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-fg">Architecture Score</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">
          Every score is a baseline plus the reasons listed under it. Open a row to see them.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {DIMENSIONS.map((d) => {
          const s = evaluation.scores[d]
          const t = tone(s.value)
          const delta = previous ? Math.round((s.value - previous.scores[d].value) * 10) / 10 : null
          return (
            <li key={d}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50 [&::-webkit-details-marker]:hidden">
                  <span className="w-32 shrink-0 text-[13px] text-fg">
                    {DIMENSION_LABELS[d]}
                    {HINT[d] && <span className="block font-mono text-[10px] text-fg-subtle">{HINT[d]}</span>}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                    <span
                      className={cn('block h-full rounded-full transition-[width] duration-500', toneBar[t])}
                      style={{ width: `${s.value * 10}%` }}
                    />
                  </span>
                  <span className={cn('w-9 text-right font-mono text-sm font-medium tabular-nums', toneText[t])}>
                    {s.value.toFixed(1)}
                  </span>
                  <span className="w-12 text-right">{delta !== null && <Delta value={delta} />}</span>
                </summary>
                <ul className="space-y-1 px-4 pb-3 pl-[9.25rem] text-[12px] leading-snug">
                  {s.factors.map((f, i) => (
                    <li key={`${f.rule}-${i}`} className="flex gap-2">
                      <span
                        className={cn(
                          'w-9 shrink-0 text-right font-mono tabular-nums',
                          f.delta > 0 ? 'text-healthy' : f.delta < 0 ? 'text-failed' : 'text-fg-subtle',
                        )}
                      >
                        {f.delta > 0 ? '+' : ''}
                        {f.delta === 0 ? '·' : f.delta.toFixed(1)}
                      </span>
                      <span className="text-fg-muted">{f.text}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function Comparison({ diff, cmp }: { diff: ReturnType<typeof diffArchitectures>; cmp: ReturnType<typeof compareEvaluations> }) {
  const changes = [
    ...diff.added.map((n) => ({ sign: '+', text: n.label })),
    ...diff.removed.map((n) => ({ sign: '−', text: n.label })),
    ...diff.connectionsAdded.map((c) => ({ sign: '+', text: c })),
    ...diff.connectionsRemoved.map((c) => ({ sign: '−', text: c })),
    ...diff.configChanged.map((c) => ({ sign: '~', text: `${c.node.label}: ${c.changes.join(', ')}` })),
    ...diff.renamed.map((r) => ({ sign: '~', text: `${r.from} renamed to ${r.to}` })),
  ]
  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-fg">Before vs After</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">Compared with your previous evaluation.</p>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">
            <th className="px-4 py-2 font-normal">Dimension</th>
            <th className="px-2 py-2 text-right font-normal">Before</th>
            <th className="px-2 py-2 text-right font-normal">After</th>
            <th className="px-4 py-2 text-right font-normal">Change</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {cmp.dimensions.map((c) => (
            <tr key={c.dimension} className="border-t border-border">
              <td className="px-4 py-1.5 font-sans text-fg">{DIMENSION_LABELS[c.dimension]}</td>
              <td className="px-2 py-1.5 text-right text-fg-muted">{c.before.toFixed(1)}</td>
              <td className="px-2 py-1.5 text-right text-fg">{c.after.toFixed(1)}</td>
              <td className="px-4 py-1.5 text-right">
                <Delta value={c.delta} />
              </td>
            </tr>
          ))}
          <tr className="border-t border-border-strong">
            <td className="px-4 py-1.5 font-sans font-medium text-fg">Overall</td>
            <td className="px-2 py-1.5 text-right text-fg-muted">{cmp.overall.before.toFixed(1)}</td>
            <td className="px-2 py-1.5 text-right font-medium text-fg">{cmp.overall.after.toFixed(1)}</td>
            <td className="px-4 py-1.5 text-right">
              <Delta value={cmp.overall.delta} />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="border-t border-border p-4">
        <h3 className="text-xs font-semibold text-fg">What changed?</h3>
        <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-fg-muted">
          {cmp.explanations.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {isEmptyDiff(diff) ? (
          <p className="mt-3 text-xs text-fg-subtle">The design is identical to the previous evaluation.</p>
        ) : (
          <ul
            className="mt-3 space-y-0.5 rounded-md border border-border bg-surface-2/50 p-2.5 font-mono text-[11.5px]"
            aria-label="Architecture diff"
          >
            {changes.slice(0, 12).map((c, i) => (
              <li key={i} className={c.sign === '+' ? 'text-healthy' : c.sign === '−' ? 'text-failed' : 'text-degraded'}>
                {c.sign} {c.text}
              </li>
            ))}
            {changes.length > 12 && <li className="text-fg-subtle">… and {changes.length - 12} more</li>}
          </ul>
        )}
      </div>
    </Card>
  )
}

function Tradeoffs({ tradeoffs }: { tradeoffs: EvaluationRecord['evaluation']['tradeoffs'] }) {
  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h2 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg">
          <Scale className="size-3.5 text-fg-subtle" aria-hidden="true" /> Trade-offs in this design
        </h2>
        <p className="mt-0.5 text-xs text-fg-subtle">Nothing here is free. This is what each choice buys and what it costs.</p>
      </div>
      {tradeoffs.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-fg-subtle">
          A minimal design makes few trade-offs. Add components to see what they cost.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {tradeoffs.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <h3 className="text-[13px] font-medium text-fg">{t.title}</h3>
              <p className="mt-1 flex gap-2 text-[12.5px] text-fg-muted">
                <Plus className="mt-0.5 size-3.5 shrink-0 text-healthy" aria-label="Benefit" /> {t.benefit}
              </p>
              <p className="mt-0.5 flex gap-2 text-[12.5px] text-fg-muted">
                <Minus className="mt-0.5 size-3.5 shrink-0 text-degraded" aria-label="Cost" /> {t.cost}
              </p>
              {t.context && <p className="mt-1.5 pl-5.5 text-[12px] text-fg-subtle italic">{t.context}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

interface InsightListProps {
  title: string
  icon: typeof CheckCircle2
  iconTone: string
  items: Insight[]
  empty: string
  severity?: boolean
  onFocus: (ids: string[]) => void
}

function InsightList({ title, icon: Icon, iconTone, items, empty, severity, onFocus }: InsightListProps) {
  return (
    <Card>
      <h2 className="flex items-center gap-1.5 border-b border-border px-4 py-3 text-[13px] font-semibold text-fg">
        <Icon className={cn('size-3.5', iconTone)} aria-hidden="true" /> {title}
        <span className="ml-auto font-mono text-[11px] font-normal text-fg-subtle">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-fg-subtle">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="px-4 py-2.5">
              <div className="flex items-start gap-2">
                <span className="text-[13px] font-medium text-fg">{i.title}</span>
                {severity && (
                  <Badge tone={SEVERITY_TONE[i.severity]} className="ml-auto shrink-0">
                    {i.severity}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{i.detail}</p>
              {i.nodeIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onFocus(i.nodeIds)}
                  className="mt-1 text-[11.5px] text-fg-subtle underline-offset-2 hover:text-accent hover:underline"
                >
                  Show on canvas
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
