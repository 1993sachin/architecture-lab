import { COMPONENT_BY_TYPE } from './catalog'
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  type Architecture,
  type ArchitectureEvaluation,
  type ComponentConfig,
  type DesignNode,
  type Dimension,
} from './types'

export interface ArchitectureDiff {
  added: DesignNode[]
  removed: DesignNode[]
  /** Connections as "Source → Target" labels. */
  connectionsAdded: string[]
  connectionsRemoved: string[]
  configChanged: Array<{ node: DesignNode; changes: string[] }>
  renamed: Array<{ from: string; to: string }>
}

const CONFIG_LABELS: Record<keyof ComponentConfig, string> = {
  instances: 'instances',
  autoscaling: 'autoscaling',
  cpu: 'CPU',
  protocol: 'protocol',
  readCapacity: 'read capacity',
  writeCapacity: 'write capacity',
  replication: 'replication',
  regions: 'regions',
  ttl: 'TTL',
  cacheStrategy: 'cache strategy',
  eviction: 'eviction',
}

const show = (v: unknown) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v ?? '–'))

/** What changed between two versions of a design, matched by node id. */
export function diffArchitectures(before: Architecture, after: Architecture): ArchitectureDiff {
  const prev = new Map(before.nodes.map((n) => [n.id, n]))
  const next = new Map(after.nodes.map((n) => [n.id, n]))
  const edgeLabel = (arch: Map<string, DesignNode>, s: string, t: string) =>
    `${arch.get(s)?.label ?? s} → ${arch.get(t)?.label ?? t}`
  const prevEdges = new Set(before.edges.map((e) => `${e.source}>${e.target}`))
  const nextEdges = new Set(after.edges.map((e) => `${e.source}>${e.target}`))

  const configChanged: ArchitectureDiff['configChanged'] = []
  const renamed: ArchitectureDiff['renamed'] = []
  for (const n of after.nodes) {
    const old = prev.get(n.id)
    if (!old) continue
    if (old.label !== n.label) renamed.push({ from: old.label, to: n.label })
    if (old.type !== n.type) {
      configChanged.push({ node: n, changes: [`type ${COMPONENT_BY_TYPE[old.type].label} → ${COMPONENT_BY_TYPE[n.type].label}`] })
      continue
    }
    const keys = new Set([...Object.keys(old.config), ...Object.keys(n.config)]) as Set<keyof ComponentConfig>
    const changes = [...keys]
      .filter((k) => old.config[k] !== n.config[k])
      .map((k) => `${CONFIG_LABELS[k]} ${show(old.config[k])} → ${show(n.config[k])}`)
    if (changes.length) configChanged.push({ node: n, changes })
  }

  return {
    added: after.nodes.filter((n) => !prev.has(n.id)),
    removed: before.nodes.filter((n) => !next.has(n.id)),
    connectionsAdded: [...nextEdges]
      .filter((e) => !prevEdges.has(e))
      .map((e) => edgeLabel(next, ...(e.split('>') as [string, string]))),
    connectionsRemoved: [...prevEdges]
      .filter((e) => !nextEdges.has(e))
      .map((e) => edgeLabel(prev, ...(e.split('>') as [string, string]))),
    configChanged,
    renamed,
  }
}

export const isEmptyDiff = (d: ArchitectureDiff) =>
  !d.added.length &&
  !d.removed.length &&
  !d.connectionsAdded.length &&
  !d.connectionsRemoved.length &&
  !d.configChanged.length &&
  !d.renamed.length

export interface DimensionChange {
  dimension: Dimension
  before: number
  after: number
  delta: number
}

export interface EvaluationComparison {
  overall: { before: number; after: number; delta: number }
  dimensions: DimensionChange[]
  /** Plain-language explanations of the biggest movements. */
  explanations: string[]
}

const fmt = (v: number) => v.toFixed(1)

/**
 * Compares two evaluations and explains the movements by the rules that
 * appeared, disappeared or changed between them.
 */
export function compareEvaluations(
  before: ArchitectureEvaluation,
  after: ArchitectureEvaluation,
  diff?: ArchitectureDiff,
): EvaluationComparison {
  const dimensions = DIMENSIONS.map((d) => {
    const b = before.scores[d].value
    const a = after.scores[d].value
    return { dimension: d, before: b, after: a, delta: Math.round((a - b) * 10) / 10 }
  })

  const reasonFor = (d: Dimension, direction: 1 | -1): string | undefined => {
    const sum = (e: ArchitectureEvaluation) => {
      const m = new Map<string, { delta: number; text: string }>()
      for (const f of e.scores[d].factors) {
        const cur = m.get(f.rule)
        m.set(f.rule, { delta: (cur?.delta ?? 0) + f.delta, text: f.text })
      }
      return m
    }
    const b = sum(before)
    const a = sum(after)
    const rules = new Set([...b.keys(), ...a.keys()])
    let best: { change: number; text: string } | undefined
    for (const r of rules) {
      const change = (a.get(r)?.delta ?? 0) - (b.get(r)?.delta ?? 0)
      if (change * direction <= 0.05) continue
      // A factor that disappeared explains the move by its absence.
      const text = a.get(r) ? a.get(r)!.text : `no longer: ${b.get(r)!.text.charAt(0).toLowerCase()}${b.get(r)!.text.slice(1)}`
      if (!best || Math.abs(change) > Math.abs(best.change)) best = { change, text }
    }
    return best?.text
  }

  const moved = dimensions.filter((c) => Math.abs(c.delta) >= 0.3).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  const ups = moved.filter((c) => c.delta > 0)
  const downs = moved.filter((c) => c.delta < 0)
  const explanations: string[] = []

  const change = diff
    ? [
        ...diff.added.map((n) => `adding ${n.label}`),
        ...diff.removed.map((n) => `removing ${n.label}`),
        ...diff.configChanged.map((c) => `reconfiguring ${c.node.label}`),
      ]
    : []
  const lead = change.length
    ? `${change
        .slice(0, 3)
        .join(', ')
        .replace(/^./, (c) => c.toUpperCase())}`
    : 'Your changes'
  if (ups.length || downs.length) {
    const up = ups[0]
    const down = downs[0]
    const verb = (c: DimensionChange) =>
      `${c.dimension === 'cost' || c.dimension === 'complexity' ? `the ${DIMENSION_LABELS[c.dimension].toLowerCase()} score` : DIMENSION_LABELS[c.dimension].toLowerCase()} from ${fmt(c.before)} → ${fmt(c.after)}`
    if (up && down) explanations.push(`${lead} improved ${verb(up)} but lowered ${verb(down)}.`)
    else if (up) explanations.push(`${lead} improved ${verb(up)}.`)
    else if (down) explanations.push(`${lead} lowered ${verb(down)}.`)
  } else {
    explanations.push('Scores barely moved: the change did not affect what this challenge stresses.')
  }
  for (const c of moved.slice(0, 4)) {
    const why = reasonFor(c.dimension, c.delta > 0 ? 1 : -1)
    if (why) explanations.push(`${DIMENSION_LABELS[c.dimension]} ${c.delta > 0 ? '+' : ''}${fmt(c.delta)}: ${why}`)
  }

  return {
    overall: {
      before: before.overallScore,
      after: after.overallScore,
      delta: Math.round((after.overallScore - before.overallScore) * 10) / 10,
    },
    dimensions,
    explanations,
  }
}
