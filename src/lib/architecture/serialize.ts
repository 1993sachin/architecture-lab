import { COMPONENT_BY_TYPE, defaultConfig } from './catalog'
import { getChallenge } from './challenges'
import type { Architecture, ArchitectureEvaluation, ComponentConfig, ComponentType, DesignEdge, DesignNode } from './types'

/**
 * Compact, versioned encoding for share links:
 * { v, c, n: [[id, type, label?, x, y, config-diff?]], e: [[sourceIndex, targetIndex]] }
 * Labels and config are only stored when they differ from the defaults, and
 * edges reference nodes by index, which keeps URLs short.
 */
interface Compact {
  v: 1
  c: string
  n: Array<[string, ComponentType, string | 0, number, number, ComponentConfig?]>
  e: Array<[number, number]>
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)))
}

function configDiff(type: ComponentType, config: ComponentConfig): ComponentConfig | undefined {
  const defaults = defaultConfig(type)
  const diff: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    if (defaults[k as keyof ComponentConfig] !== v) diff[k] = v
  }
  return Object.keys(diff).length ? (diff as ComponentConfig) : undefined
}

export function encodeArchitecture(arch: Architecture): string {
  const index = new Map(arch.nodes.map((n, i) => [n.id, i]))
  const compact: Compact = {
    v: 1,
    c: arch.challengeId,
    n: arch.nodes.map((n) => {
      const label = n.label === COMPONENT_BY_TYPE[n.type].label ? 0 : n.label
      const diff = configDiff(n.type, n.config)
      const row: Compact['n'][number] = [n.id, n.type, label, Math.round(n.position.x), Math.round(n.position.y)]
      if (diff) row.push(diff)
      return row
    }),
    e: arch.edges.flatMap((e) => {
      const s = index.get(e.source)
      const t = index.get(e.target)
      return s === undefined || t === undefined ? [] : [[s, t] as [number, number]]
    }),
  }
  return toBase64Url(JSON.stringify(compact))
}

const isType = (t: unknown): t is ComponentType => typeof t === 'string' && t in COMPONENT_BY_TYPE

/** Keeps only known config keys with values of the right kind. */
function sanitizeConfig(raw: unknown): ComponentConfig {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const c: ComponentConfig = {}
  const num = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined
  const pick = <T extends string>(v: unknown, allowed: readonly T[]) =>
    (allowed as readonly unknown[]).includes(v) ? (v as T) : undefined
  if (r.instances !== undefined) c.instances = num(r.instances, 1, 50)
  if (typeof r.autoscaling === 'boolean') c.autoscaling = r.autoscaling
  if (r.cpu !== undefined) c.cpu = pick(r.cpu, ['small', 'medium', 'large'] as const)
  if (r.protocol !== undefined) c.protocol = pick(r.protocol, ['http', 'websocket'] as const)
  if (r.readCapacity !== undefined) c.readCapacity = pick(r.readCapacity, ['low', 'medium', 'high'] as const)
  if (r.writeCapacity !== undefined) c.writeCapacity = pick(r.writeCapacity, ['low', 'medium', 'high'] as const)
  if (r.replication !== undefined) c.replication = pick(r.replication, ['none', 'replicas', 'multi-region'] as const)
  if (r.regions !== undefined) c.regions = num(r.regions, 1, 10)
  if (r.ttl !== undefined) c.ttl = num(r.ttl, 0, 604800)
  if (r.cacheStrategy !== undefined)
    c.cacheStrategy = pick(r.cacheStrategy, ['cache-aside', 'write-through', 'write-back'] as const)
  if (r.eviction !== undefined) c.eviction = pick(r.eviction, ['lru', 'lfu', 'ttl'] as const)
  for (const k of Object.keys(c) as Array<keyof ComponentConfig>) if (c[k] === undefined) delete c[k]
  return c
}

const MAX_NODES = 80

/** Builds a validated architecture from loosely typed parts (URL or file). */
function assemble(challengeId: unknown, rawNodes: unknown[], rawEdges: Array<[unknown, unknown]>): Architecture | null {
  if (typeof challengeId !== 'string' || !getChallenge(challengeId)) return null
  const nodes: DesignNode[] = []
  for (const raw of rawNodes.slice(0, MAX_NODES)) {
    const r = raw as Partial<DesignNode>
    if (!isType(r.type) || typeof r.id !== 'string' || !r.id || nodes.some((n) => n.id === r.id)) continue
    const x = Number(r.position?.x)
    const y = Number(r.position?.y)
    nodes.push({
      id: r.id.slice(0, 40),
      type: r.type,
      label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : COMPONENT_BY_TYPE[r.type].label,
      position: { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 },
      config: { ...defaultConfig(r.type), ...sanitizeConfig(r.config) },
    })
  }
  const ids = new Set(nodes.map((n) => n.id))
  const edges: DesignEdge[] = []
  for (const [s, t] of rawEdges) {
    if (typeof s !== 'string' || typeof t !== 'string' || s === t || !ids.has(s) || !ids.has(t)) continue
    const id = `${s}->${t}`
    if (!edges.some((e) => e.id === id)) edges.push({ id, source: s, target: t })
  }
  return { challengeId, nodes, edges }
}

/** Decodes a share-link payload. Returns null for anything malformed. */
export function decodeArchitecture(encoded: string): Architecture | null {
  try {
    const raw = JSON.parse(fromBase64Url(encoded)) as Partial<Compact>
    if (raw.v !== 1 || !Array.isArray(raw.n) || !Array.isArray(raw.e)) return null
    const rows = raw.n.filter(Array.isArray)
    const nodes = rows.map(([id, type, label, x, y, config]) => ({
      id,
      type,
      label: label || undefined,
      position: { x, y },
      config,
    }))
    const edges = raw.e
      .filter((e): e is [number, number] => Array.isArray(e) && e.length === 2)
      .map(([s, t]) => [rows[s]?.[0], rows[t]?.[0]] as [unknown, unknown])
    return assemble(raw.c, nodes, edges)
  } catch {
    return null
  }
}

export const EXPORT_FORMAT = 'architecture-lab/architecture@1'

export interface ArchitectureExport {
  format: typeof EXPORT_FORMAT
  exportedAt: string
  challenge: { id: string; title: string }
  nodes: DesignNode[]
  connections: Array<{ source: string; target: string }>
  evaluation: ArchitectureEvaluation | null
}

/** Human-readable JSON export: challenge, nodes with configuration, connections and the latest evaluation. */
export function exportArchitecture(
  arch: Architecture,
  evaluation: ArchitectureEvaluation | null,
  now = new Date(),
): ArchitectureExport {
  return {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    challenge: { id: arch.challengeId, title: getChallenge(arch.challengeId)?.title ?? arch.challengeId },
    nodes: arch.nodes,
    connections: arch.edges.map((e) => ({ source: e.source, target: e.target })),
    evaluation,
  }
}

/** Parses an exported file. Returns null when it is not a valid export. */
export function importArchitecture(text: string): Architecture | null {
  try {
    const raw = JSON.parse(text) as Partial<ArchitectureExport>
    if (raw.format !== EXPORT_FORMAT || !Array.isArray(raw.nodes) || !Array.isArray(raw.connections)) return null
    return assemble(
      raw.challenge?.id,
      raw.nodes,
      raw.connections.map((c) => [c?.source, c?.target]),
    )
  } catch {
    return null
  }
}
