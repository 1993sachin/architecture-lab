import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  COMPONENT_BY_TYPE,
  defaultConfig,
  type Architecture,
  type ArchitectureEvaluation,
  type ComponentConfig,
  type ComponentType,
  type DesignNode,
} from '@/lib/architecture'

/** An evaluation together with the exact design it judged. */
export interface EvaluationRecord {
  architecture: Architecture
  evaluation: ArchitectureEvaluation
}

interface SimulatorStore {
  // Architecture state: the design being edited, kept per challenge as a draft.
  drafts: Record<string, Architecture>
  // Evaluation state: the latest result and the one before it, per challenge.
  evaluations: Record<string, { current: EvaluationRecord | null; previous: EvaluationRecord | null }>

  load: (arch: Architecture) => void
  addNode: (challengeId: string, type: ComponentType, position: { x: number; y: number }) => string
  updateNode: (
    challengeId: string,
    id: string,
    patch: Partial<Pick<DesignNode, 'label' | 'type' | 'position'>> & { config?: ComponentConfig },
  ) => void
  moveNode: (challengeId: string, id: string, position: { x: number; y: number }) => void
  removeNodes: (challengeId: string, ids: string[]) => void
  duplicateNode: (challengeId: string, id: string) => string | null
  connect: (challengeId: string, source: string, target: string) => boolean
  removeEdges: (challengeId: string, ids: string[]) => void
  reverseEdge: (challengeId: string, id: string) => void
  clearDesign: (challengeId: string) => void
  recordEvaluation: (record: EvaluationRecord) => void
}

/** Every challenge starts with a client on the canvas, so there is an obvious first connection. */
export function starterArchitecture(challengeId: string): Architecture {
  return {
    challengeId,
    nodes: [{ id: 'client', type: 'client', label: 'Client', position: { x: 0, y: 0 }, config: {} }],
    edges: [],
  }
}

function nextId(arch: Architecture, type: ComponentType): string {
  let i = 1
  while (arch.nodes.some((n) => n.id === `${type}-${i}`)) i++
  return `${type}-${i}`
}

/** "Service", then "Service 2", "Service 3"… so nodes stay distinguishable. */
function nextLabel(arch: Architecture, base: string): string {
  if (!arch.nodes.some((n) => n.label === base)) return base
  let i = 2
  while (arch.nodes.some((n) => n.label === `${base} ${i}`)) i++
  return `${base} ${i}`
}

export const useSimulatorStore = create<SimulatorStore>()(
  persist(
    (set, get) => {
      const draft = (challengeId: string) => get().drafts[challengeId] ?? starterArchitecture(challengeId)
      const save = (arch: Architecture) => set((s) => ({ drafts: { ...s.drafts, [arch.challengeId]: arch } }))

      return {
        drafts: {},
        evaluations: {},

        load: (arch) => {
          save(arch)
          // A loaded design starts a fresh comparison history.
          set((s) => ({ evaluations: { ...s.evaluations, [arch.challengeId]: { current: null, previous: null } } }))
        },

        addNode: (challengeId, type, position) => {
          const arch = draft(challengeId)
          const id = nextId(arch, type)
          const node: DesignNode = {
            id,
            type,
            label: nextLabel(arch, COMPONENT_BY_TYPE[type].label),
            position,
            config: defaultConfig(type),
          }
          save({ ...arch, nodes: [...arch.nodes, node] })
          return id
        },

        updateNode: (challengeId, id, patch) => {
          const arch = draft(challengeId)
          save({
            ...arch,
            nodes: arch.nodes.map((n) => {
              if (n.id !== id) return n
              const next = { ...n, ...patch, config: patch.config ? { ...n.config, ...patch.config } : n.config }
              // Switching SQL ↔ NoSQL keeps the node, its connections and its settings.
              if (patch.type && patch.type !== n.type && n.label === COMPONENT_BY_TYPE[n.type].label)
                next.label = COMPONENT_BY_TYPE[patch.type].label
              return next
            }),
          })
        },

        moveNode: (challengeId, id, position) => {
          const arch = draft(challengeId)
          save({ ...arch, nodes: arch.nodes.map((n) => (n.id === id ? { ...n, position } : n)) })
        },

        removeNodes: (challengeId, ids) => {
          const arch = draft(challengeId)
          const gone = new Set(ids)
          save({
            ...arch,
            nodes: arch.nodes.filter((n) => !gone.has(n.id)),
            edges: arch.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
          })
        },

        duplicateNode: (challengeId, id) => {
          const arch = draft(challengeId)
          const node = arch.nodes.find((n) => n.id === id)
          if (!node) return null
          const copy: DesignNode = {
            ...structuredClone(node),
            id: nextId(arch, node.type),
            label: nextLabel(arch, node.label.replace(/ \d+$/, '')),
            position: { x: node.position.x + 40, y: node.position.y + 40 },
          }
          save({ ...arch, nodes: [...arch.nodes, copy] })
          return copy.id
        },

        connect: (challengeId, source, target) => {
          const arch = draft(challengeId)
          if (source === target) return false
          if (arch.edges.some((e) => e.source === source && e.target === target)) return false
          save({ ...arch, edges: [...arch.edges, { id: `${source}->${target}`, source, target }] })
          return true
        },

        removeEdges: (challengeId, ids) => {
          const arch = draft(challengeId)
          save({ ...arch, edges: arch.edges.filter((e) => !ids.includes(e.id)) })
        },

        reverseEdge: (challengeId, id) => {
          const arch = draft(challengeId)
          const edge = arch.edges.find((e) => e.id === id)
          if (!edge || arch.edges.some((e) => e.source === edge.target && e.target === edge.source)) return
          save({
            ...arch,
            edges: arch.edges.map((e) =>
              e.id === id ? { id: `${e.target}->${e.source}`, source: e.target, target: e.source } : e,
            ),
          })
        },

        clearDesign: (challengeId) => {
          save(starterArchitecture(challengeId))
          set((s) => ({ evaluations: { ...s.evaluations, [challengeId]: { current: null, previous: null } } }))
        },

        recordEvaluation: (record) =>
          set((s) => {
            const id = record.architecture.challengeId
            const prior = s.evaluations[id]?.current ?? null
            return { evaluations: { ...s.evaluations, [id]: { current: record, previous: prior } } }
          }),
      }
    },
    {
      name: 'architecture-lab:simulator',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Drafts survive a reload; evaluations are cheap to recompute and are not stored.
      partialize: (s) => ({ drafts: s.drafts }),
    },
  ),
)

const starters = new Map<string, Architecture>()
const starterFor = (challengeId: string) => {
  if (!starters.has(challengeId)) starters.set(challengeId, starterArchitecture(challengeId))
  return starters.get(challengeId)!
}

/** The design for a challenge, or the (stable) starter design if none was saved yet. */
export const useDraft = (challengeId: string) => useSimulatorStore((s) => s.drafts[challengeId]) ?? starterFor(challengeId)
