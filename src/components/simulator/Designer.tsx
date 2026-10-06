import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { MarkerType, type Connection, type EdgeChange, type NodeChange, type ReactFlowInstance } from '@xyflow/react'
import { AnimatePresence, m } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  FileDown,
  FileUp,
  LayoutGrid,
  Link2,
  MessageCircleQuestion,
  Play,
  RotateCcw,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  COMPONENT_BY_TYPE,
  coachPrompt,
  diffArchitectures,
  evaluateArchitecture,
  exportArchitecture,
  importArchitecture,
  isEmptyDiff,
  nextHints,
  validateArchitecture,
  type Architecture,
  type Challenge,
  type ComponentType,
  type DesignNode,
} from '@/lib/architecture'
import { useDraft, useSimulatorStore } from '@/store/simulatorStore'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion'
import { ArchitectureCanvas } from '@/components/architecture/ArchitectureCanvas'
import type { AnyArchitectureNode, ArchitectureEdgeType, ArchitectureNodeData } from '@/components/architecture/types'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Drawer } from '@/components/ui/Drawer'
import { ChallengeBrief } from './ChallengeBrief'
import { DIFFICULTY_TONE } from '@/components/ui/DifficultyBadge'
import { ConfigPanel } from './ConfigPanel'
import { EvaluationResults } from './EvaluationResults'
import { IssuesPanel } from './IssuesPanel'
import { Palette } from './Palette'
import { DRAG_MIME, KIND_OF } from './componentKinds'
import { copyText, downloadBlob, renderResultCard, shareUrl } from './share'
import { urlShortenerWalkthrough, WALKTHROUGH_ID, type WalkthroughState } from './walkthrough'
import { useGuideRun, useGuideStore } from '@/store/guideStore'
import { CoachPanel } from '@/components/guide/CoachPanel'
import { ContextualHelp } from '@/components/guide/ContextualHelp'
import { SIMULATOR_HELP } from './help'
import { GuidedExperiment } from '@/components/guide/GuidedExperiment'
import { HintPanel } from '@/components/guide/HintPanel'
import { TrySomething, type TryIdea } from '@/components/guide/TrySomething'

type Tab = 'requirements' | 'configure' | 'issues'

const PHASES = [
  'Analyzing architecture...',
  'Evaluating scalability...',
  'Evaluating reliability...',
  'Evaluating performance...',
  'Evaluating cost...',
  'Analyzing bottlenecks...',
]
const PHASE_MS = 260
const NODE_W = 200
const NODE_H = 90

/** Where the walkthrough places each component, relative to the Client, so the design reads top to bottom. */
const WALKTHROUGH_SPOTS: Partial<Record<ComponentType, { x: number; y: number }>> = {
  cdn: { x: 0, y: 140 },
  gateway: { x: 0, y: 280 },
  service: { x: 0, y: 420 },
  cache: { x: -150, y: 570 },
  sql: { x: 150, y: 570 },
}

function designIdeas(challenge: Challenge): TryIdea[] {
  return [
    {
      id: 'four',
      text: `Try designing the ${challenge.title} with only 4 components.`,
      watch: 'which scores suffer, and which do not',
    },
    {
      id: 'no-cache',
      text: 'Evaluate, remove your cache, and re-evaluate.',
      watch: 'the before/after table: performance versus complexity',
    },
    {
      id: 'replicas',
      text: 'Run every service with 3 instances and replicate the database.',
      watch: 'reliability going up and cost going up with it',
    },
    {
      id: 'nosql',
      text: 'Switch your database between SQL and NoSQL and re-evaluate.',
      watch: 'what the evaluator says about consistency and scale',
    },
    {
      id: 'queue',
      text: 'Put a Message Queue and a Worker behind one service.',
      watch: 'the trade-off explanation about eventual consistency',
    },
  ]
}

/** Picks anchor sides from the relative position of two nodes, so edges read naturally. */
function pickHandles(s: DesignNode, t: DesignNode) {
  const dx = t.position.x - s.position.x
  const dy = t.position.y - s.position.y
  if (dy > 40 && Math.abs(dy) >= Math.abs(dx) * 0.6) return { sourceHandle: 'bottom', targetHandle: 'top' }
  if (dx >= 0) return { sourceHandle: 'right', targetHandle: 'left-in' }
  return { sourceHandle: 'left-out', targetHandle: 'right-in' }
}

function configBadges(n: DesignNode): string[] {
  const c = n.config
  const b: string[] = []
  if (c.instances !== undefined && ['service', 'worker', 'webapp', 'gateway', 'loadBalancer'].includes(n.type))
    b.push(`×${c.instances}`)
  if (c.autoscaling && n.type !== 'function') b.push('autoscale')
  if (c.protocol === 'websocket') b.push('WebSocket')
  if (c.replication && c.replication !== 'none') b.push(c.replication === 'multi-region' ? 'multi-region' : 'replicas')
  if (n.type === 'cache' && c.ttl) b.push(c.ttl >= 3600 ? `TTL ${c.ttl / 3600}h` : `TTL ${Math.round(c.ttl / 60)}m`)
  if ((n.type === 'sql' || n.type === 'nosql') && (c.regions ?? 1) > 1) b.push(`${c.regions} regions`)
  return b
}

export function Designer({
  challenge,
  onBack,
  onSwitchChallenge,
  walkthrough = false,
  onExitWalkthrough,
}: {
  challenge: Challenge
  onBack: () => void
  onSwitchChallenge: (id: string) => void
  /** Run the beginner walkthrough on top of the designer. */
  walkthrough?: boolean
  onExitWalkthrough?: () => void
}) {
  const arch = useDraft(challenge.id)
  const store = useSimulatorStore
  const record = useSimulatorStore((s) => s.evaluations[challenge.id])
  const current = record?.current ?? null
  const previous = record?.previous ?? null
  const reducedMotion = usePrefersReducedMotion()
  const desktop = useMediaQuery('(min-width: 1024px)')

  const [selection, setSelection] = useState<{ node: string | null; edge: string | null }>({ node: null, edge: null })
  const [tab, setTab] = useState<Tab>('requirements')
  const [drawer, setDrawer] = useState<null | 'palette' | 'panel'>(null)
  const [phase, setPhase] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const flow = useRef<ReactFlowInstance<AnyArchitectureNode, ArchitectureEdgeType> | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const validation = useMemo(() => validateArchitecture(arch), [arch])
  const stale = !!current && !isEmptyDiff(diffArchitectures(current.architecture, arch))
  const errors = validation.issues.filter((i) => i.severity === 'error').length
  const warnings = validation.issues.filter((i) => i.severity === 'warning').length

  const flash = useCallback((text: string) => {
    setStatus(text)
    window.setTimeout(() => setStatus((s) => (s === text ? null : s)), 3000)
  }, [])

  // Node health on the canvas: validation first, then (if still current) evaluation findings.
  const nodes = useMemo<AnyArchitectureNode[]>(() => {
    const evaluation = current && !stale ? current.evaluation : null
    const spof = new Set(evaluation?.singlePointsOfFailure.flatMap((i) => i.nodeIds) ?? [])
    const bottleneck = new Set(evaluation?.bottlenecks.flatMap((i) => i.nodeIds) ?? [])
    return arch.nodes.map((n) => {
      const issues = validation.issues.filter((i) => i.nodeIds.includes(n.id))
      let status: ArchitectureNodeData['status'] = 'healthy'
      let statusLabel = 'OK'
      if (issues.some((i) => i.severity === 'error')) [status, statusLabel] = ['failed', 'Invalid']
      else if (spof.has(n.id)) [status, statusLabel] = ['degraded', 'Single point of failure']
      else if (bottleneck.has(n.id)) [status, statusLabel] = ['warning', 'Bottleneck']
      else if (issues.some((i) => i.severity === 'warning')) [status, statusLabel] = ['warning', 'Check']
      return {
        id: n.id,
        type: 'architecture',
        position: n.position,
        selected: selection.node === n.id,
        data: {
          label: n.label,
          kind: KIND_OF[n.type],
          status,
          statusLabel,
          subtitle:
            n.label === COMPONENT_BY_TYPE[n.type].label ? COMPONENT_BY_TYPE[n.type].category : COMPONENT_BY_TYPE[n.type].label,
          badges: configBadges(n),
          editable: true,
        },
      }
    })
  }, [arch.nodes, validation, current, stale, selection.node])

  const edges = useMemo<ArchitectureEdgeType[]>(() => {
    const byId = new Map(arch.nodes.map((n) => [n.id, n]))
    return arch.edges.flatMap((e) => {
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      if (!s || !t) return []
      const invalid = validation.issues.some((i) => i.severity === 'error' && i.id.endsWith(e.id))
      const selected = selection.edge === e.id
      return [
        {
          id: e.id,
          source: e.source,
          target: e.target,
          ...pickHandles(s, t),
          type: 'architecture',
          selected,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: invalid ? 'var(--failed)' : selected ? 'var(--accent)' : 'var(--fg-subtle)',
          },
          data: { flow: invalid ? 'failed' : 'ok', ambient: false },
        },
      ]
    })
  }, [arch.nodes, arch.edges, validation, selection.edge])

  const select = useCallback(
    (node: string | null, edge: string | null = null) => {
      setSelection({ node, edge })
      if (node || edge) {
        setTab('configure')
        if (!desktop) setDrawer('panel')
      }
    },
    [desktop],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<AnyArchitectureNode>[]) => {
      const removed: string[] = []
      for (const c of changes) {
        if (c.type === 'position' && c.position) store.getState().moveNode(challenge.id, c.id, c.position)
        else if (c.type === 'remove') removed.push(c.id)
      }
      if (removed.length) {
        store.getState().removeNodes(challenge.id, removed)
        setSelection({ node: null, edge: null })
      }
    },
    [challenge.id, store],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ArchitectureEdgeType>[]) => {
      const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id)
      if (removed.length) {
        store.getState().removeEdges(challenge.id, removed)
        setSelection((s) => (s.edge && removed.includes(s.edge) ? { node: null, edge: null } : s))
      }
    },
    [challenge.id, store],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) store.getState().connect(challenge.id, c.source, c.target)
    },
    [challenge.id, store],
  )

  const addAt = useCallback(
    (type: ComponentType, position: { x: number; y: number }) => {
      const id = store.getState().addNode(challenge.id, type, position)
      select(id)
      setDrawer(null)
    },
    [challenge.id, store, select],
  )

  const addCentered = useCallback(
    (type: ComponentType) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const inst = flow.current
      if (!rect || !inst) return addAt(type, { x: 0, y: 0 })
      const center = inst.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      // Nudge so repeated clicks do not stack nodes exactly on top of each other.
      const n = arch.nodes.length % 5
      addAt(type, { x: center.x - NODE_W / 2 + n * 24, y: center.y - NODE_H / 2 + n * 24 })
    },
    [addAt, arch.nodes.length],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      const type = e.dataTransfer.getData(DRAG_MIME) as ComponentType
      if (!type || !(type in COMPONENT_BY_TYPE) || !flow.current) return
      e.preventDefault()
      const p = flow.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addAt(type, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 })
    },
    [addAt],
  )

  const focusNodes = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      setSelection({ node: ids[0], edge: null })
      setTab('configure')
      canvasRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
      flow.current?.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.8, duration: reducedMotion ? 0 : 400, maxZoom: 1.1 })
    },
    [reducedMotion],
  )

  const evaluate = useCallback(() => {
    if (!validation.canEvaluate || phase !== null) {
      setTab('issues')
      if (!desktop) setDrawer('panel')
      return
    }
    const snapshot: Architecture = structuredClone(arch)
    const step = reducedMotion ? 80 : PHASE_MS
    const scroll = !walkthrough
    setPhase(0)
    PHASES.forEach((_, i) => window.setTimeout(() => setPhase(i), i * step))
    window.setTimeout(() => {
      store.getState().recordEvaluation({ architecture: snapshot, evaluation: evaluateArchitecture(snapshot, challenge) })
      setPhase(null)
      // The walkthrough explains the result above the canvas, so it does not jump away.
      if (scroll)
        window.setTimeout(
          () => resultsRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }),
          60,
        )
    }, PHASES.length * step)
  }, [validation.canEvaluate, phase, arch, reducedMotion, store, challenge, desktop, walkthrough])

  // Beginner walkthrough: steps are data; these are the only things it can do to the designer.
  const run = useGuideRun(WALKTHROUGH_ID)
  const walkthroughDef = useMemo(
    () =>
      urlShortenerWalkthrough({
        begin: () => {
          store.getState().clearDesign(challenge.id)
          setSelection({ node: null, edge: null })
        },
        add: (type, label) => {
          const draft = store.getState().drafts[challenge.id]
          const client = draft?.nodes.find((n) => n.type === 'client')
          const spot = WALKTHROUGH_SPOTS[type] ?? { x: 0, y: 300 }
          const base = client?.position ?? { x: 0, y: 0 }
          const id = store.getState().addNode(challenge.id, type, { x: base.x + spot.x, y: base.y + spot.y })
          if (label) store.getState().updateNode(challenge.id, id, { label })
          window.setTimeout(() => flow.current?.fitView({ padding: 0.2, maxZoom: 1, duration: reducedMotion ? 0 : 300 }), 50)
        },
        evaluate,
      }),
    [challenge.id, store, evaluate, reducedMotion],
  )
  const walkthroughState = useMemo<WalkthroughState>(
    () => ({ arch, validation, evaluation: current && !stale ? current.evaluation : null }),
    [arch, validation, current, stale],
  )
  const hideWorkspace = walkthrough && !run.done && run.step === 0 && !run.ctx.flags.started
  useEffect(() => {
    if (walkthrough && run.dismissed) onExitWalkthrough?.()
  }, [walkthrough, run.dismissed, onExitWalkthrough])

  // Coach Mode: a question about each component the visitor adds. It never edits the design.
  const coachOn = useGuideStore((s) => s.coach) && !walkthrough
  const [coach, setCoach] = useState<{ nodeId: string; type: ComponentType; label: string } | null>(null)
  const knownIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(arch.nodes.map((n) => n.id))
    const before = knownIds.current
    knownIds.current = ids
    if (!before || !coachOn) return
    const added = arch.nodes.filter((n) => !before.has(n.id))
    const last = added[added.length - 1]
    if (added.length === 1 && last && coachPrompt(last.type, challenge))
      setCoach({ nodeId: last.id, type: last.type, label: last.label })
  }, [arch.nodes, coachOn, challenge])
  const coachContent = coach && arch.nodes.some((n) => n.id === coach.nodeId) ? coachPrompt(coach.type, challenge) : null

  const hints = useMemo(() => nextHints(arch, challenge), [arch, challenge])
  const ideas = useMemo(() => designIdeas(challenge), [challenge])

  const share = useCallback(async () => {
    const url = shareUrl(arch)
    if (await copyText(url)) flash('Architecture link copied.')
    else window.prompt('Copy this link to share your architecture:', url)
  }, [arch, flash])

  const exportJson = useCallback(() => {
    const data = exportArchitecture(arch, current && !stale ? current.evaluation : null)
    downloadBlob(`architecture-${challenge.id}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    flash('Architecture exported.')
  }, [arch, current, stale, challenge.id, flash])

  const importJson = useCallback(
    async (file: File) => {
      const imported = importArchitecture(await file.text())
      if (!imported) {
        flash('That file is not an Architecture Lab export.')
        return
      }
      store.getState().load(imported)
      setSelection({ node: null, edge: null })
      if (imported.challengeId !== challenge.id) onSwitchChallenge(imported.challengeId)
      flash('Architecture imported.')
      window.setTimeout(() => flow.current?.fitView({ padding: 0.2, duration: 300 }), 50)
    },
    [store, challenge.id, onSwitchChallenge, flash],
  )

  const downloadCard = useCallback(async () => {
    if (!current) return
    const blob = await renderResultCard(challenge.title, current.evaluation)
    if (blob) downloadBlob(`architecture-${challenge.id}-result.png`, blob)
  }, [current, challenge])

  const clear = useCallback(() => {
    if (window.confirm('Clear the canvas and start this design again?')) {
      store.getState().clearDesign(challenge.id)
      setSelection({ node: null, edge: null })
    }
  }, [store, challenge.id])

  const selectedNode = arch.nodes.find((n) => n.id === selection.node) ?? null
  const selectedEdge = arch.edges.find((e) => e.id === selection.edge) ?? null
  const evaluationForNode = current && !stale ? current.evaluation : null
  const nodeInsights =
    selectedNode && evaluationForNode
      ? [
          ...evaluationForNode.strengths
            .filter((i) => i.nodeIds.includes(selectedNode.id))
            .map((i) => ({ ...i, kind: 'strength' })),
          ...[...evaluationForNode.weaknesses, ...evaluationForNode.singlePointsOfFailure, ...evaluationForNode.bottlenecks]
            .filter((i) => i.nodeIds.includes(selectedNode.id))
            .map((i) => ({ ...i, kind: 'risk' })),
        ]
      : []

  const panel = (
    <div>
      <div role="tablist" aria-label="Design panel" className="flex gap-1 border-b border-border px-2">
        {(
          [
            ['requirements', 'Requirements'],
            ['configure', 'Configure'],
            ['issues', `Issues${errors + warnings ? ` (${errors + warnings})` : ''}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px border-b-2 px-2 py-2.5 text-[12.5px] font-medium transition-colors',
              tab === id ? 'border-accent text-fg' : 'border-transparent text-fg-subtle hover:text-fg',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-4" role="tabpanel">
        {tab === 'requirements' && (
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-fg-muted">{challenge.problem}</p>
            <ChallengeBrief challenge={challenge} compact />
          </div>
        )}
        {tab === 'configure' && (
          <ConfigPanel
            challenge={challenge}
            node={selectedNode}
            edge={selectedEdge}
            nodes={arch.nodes}
            issues={validation.issues.filter((i) =>
              selectedEdge ? i.id.endsWith(selectedEdge.id) : selectedNode ? i.nodeIds.includes(selectedNode.id) : false,
            )}
            insights={nodeInsights}
            onUpdate={(patch) => selectedNode && store.getState().updateNode(challenge.id, selectedNode.id, patch)}
            onDelete={() => {
              if (!selectedNode) return
              store.getState().removeNodes(challenge.id, [selectedNode.id])
              setSelection({ node: null, edge: null })
            }}
            onDuplicate={() => {
              if (!selectedNode) return
              const id = store.getState().duplicateNode(challenge.id, selectedNode.id)
              if (id) setSelection({ node: id, edge: null })
            }}
            onDeleteEdge={() => {
              if (!selectedEdge) return
              store.getState().removeEdges(challenge.id, [selectedEdge.id])
              setSelection({ node: null, edge: null })
            }}
            onReverseEdge={() => {
              if (!selectedEdge) return
              store.getState().reverseEdge(challenge.id, selectedEdge.id)
              setSelection({ node: null, edge: `${selectedEdge.target}->${selectedEdge.source}` })
            }}
          />
        )}
        {tab === 'issues' && <IssuesPanel validation={validation} onFocus={focusNodes} />}
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-[12.5px] text-fg-subtle hover:text-fg"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" /> {challenge.title}
          </button>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            Architecture Decision Simulator
            <Badge tone={DIFFICULTY_TONE[challenge.difficulty]}>{challenge.difficulty}</Badge>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-accent" aria-live="polite">
            {status}
          </span>
          <ContextualHelp content={SIMULATOR_HELP} />
          <Button variant="ghost" size="sm" onClick={share} title="Copy a link that reopens this design">
            <Link2 className="size-3.5" aria-hidden="true" /> Copy Share Link
          </Button>
          <Button variant="ghost" size="sm" onClick={exportJson}>
            <FileDown className="size-3.5" aria-hidden="true" /> Export
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="size-3.5" aria-hidden="true" /> Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importJson(f)
              e.target.value = ''
            }}
          />
          <Button variant="primary" onClick={evaluate} disabled={phase !== null}>
            <Play className="size-3.5" aria-hidden="true" /> {current ? 'Re-Evaluate' : 'Evaluate Architecture'}
          </Button>
        </div>
      </div>

      {walkthrough && (
        <GuidedExperiment guide={walkthroughDef} state={walkthroughState} onStart={() => undefined} className="mt-4" />
      )}

      <div className={cn('mt-4 grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_300px]', hideWorkspace && 'hidden')}>
        {desktop && (
          <Card className="max-h-[680px] self-start overflow-y-auto p-2">
            <Palette onAdd={addCentered} />
          </Card>
        )}

        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            {!desktop && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setDrawer('palette')}>
                  <LayoutGrid className="size-3.5" aria-hidden="true" /> Components
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDrawer('panel')}>
                  <ClipboardList className="size-3.5" aria-hidden="true" /> Details
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setTab('issues')
                if (!desktop) setDrawer('panel')
              }}
              className="inline-flex items-center gap-2 rounded px-1.5 py-1 font-mono text-[11px] text-fg-subtle hover:bg-surface-2"
            >
              <span className={cn('inline-flex items-center gap-1', errors ? 'text-failed' : '')}>
                <XCircle className="size-3" aria-hidden="true" /> {errors}
              </span>
              <span className={cn('inline-flex items-center gap-1', warnings ? 'text-degraded' : '')}>
                <AlertTriangle className="size-3" aria-hidden="true" /> {warnings}
              </span>
            </button>
            <span className="hidden text-[11.5px] text-fg-subtle sm:inline">
              {arch.nodes.length} components · {arch.edges.length} connections
            </span>
            <div className="ml-auto flex items-center gap-1">
              {!walkthrough && (
                <button
                  type="button"
                  aria-pressed={coachOn}
                  onClick={() => {
                    useGuideStore.getState().setCoach(!coachOn)
                    setCoach(null)
                  }}
                  title="Coach Mode asks a question about each component you add"
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium transition-colors',
                    coachOn ? 'border-accent/50 bg-accent-soft text-accent' : 'border-border text-fg-muted hover:text-fg',
                  )}
                >
                  <MessageCircleQuestion className="size-3.5" aria-hidden="true" /> Coach {coachOn ? 'on' : 'off'}
                </button>
              )}
              {selection.node && (
                <IconButton label="Configure selected component" onClick={() => select(selection.node)}>
                  <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                </IconButton>
              )}
              <IconButton label="Clear the canvas" onClick={clear}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          {!walkthrough && (
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
              <HintPanel hints={hints.hints} resetKey={hints.id} className="min-w-0 flex-1 basis-64 self-center" />
              <TrySomething ideas={ideas} className="flex flex-col items-end" />
            </div>
          )}
          <div
            ref={canvasRef}
            className="relative"
            onDrop={onDrop}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DRAG_MIME)) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }
            }}
          >
            <ArchitectureCanvas
              // Mount fresh once the walkthrough reveals the canvas, so it measures its real size.
              key={hideWorkspace ? 'waiting' : 'ready'}
              nodes={nodes}
              edges={edges}
              description={`${challenge.title} design with ${arch.nodes.length} components: ${arch.nodes.map((n) => n.label).join(', ')}.`}
              className="bg-grid h-[540px] lg:h-[640px]"
              fitPadding={0.3}
              editing={{
                onInit: (inst) => {
                  flow.current = inst
                  // A fresh design: put the client near the top so there is room to build downwards.
                  const rect = canvasRef.current?.getBoundingClientRect()
                  const only = arch.nodes.length === 1 ? arch.nodes[0] : null
                  if (rect && only)
                    void inst.setViewport({ x: rect.width / 2 - NODE_W / 2 - only.position.x, y: 48 - only.position.y, zoom: 1 })
                },
                onNodesChange,
                onEdgesChange,
                onConnect,
                onNodeClick: (_, n) => select(n.id),
                onEdgeClick: (_, e) => select(null, e.id),
                onPaneClick: () => setSelection({ node: null, edge: null }),
              }}
            />
            {arch.nodes.length <= 1 && phase === null && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center pr-14 pl-4">
                <p className="max-w-md rounded-md border border-border bg-surface/90 px-3 py-2 text-center text-[12.5px] text-fg-muted shadow-sm backdrop-blur">
                  <span className="font-medium text-fg">You’re designing a {challenge.title}.</span> What should receive the
                  Client’s requests first? {desktop ? 'Drag components from the left' : 'Add components'}, then drag from a dot on
                  one component to another to connect them.
                </p>
              </div>
            )}
            {coachContent && coach && (
              <div className="absolute top-3 left-3 z-10 w-[min(22rem,calc(100%-1.5rem))]">
                <CoachPanel
                  key={coach.nodeId}
                  title={`You added ${coach.label}`}
                  question={coachContent.question}
                  explanation={coachContent.explain}
                  onContinue={() => setCoach(null)}
                />
              </div>
            )}
            <AnimatePresence>
              {phase !== null && (
                <m.div
                  className="absolute inset-0 z-10 flex items-center justify-center bg-bg/70 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  aria-live="polite"
                >
                  <div className="w-72 rounded-lg border border-border bg-surface p-4 shadow-lg">
                    <p className="font-mono text-[12.5px] text-fg">{PHASES[phase]}</p>
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
                      <m.div
                        className="h-full bg-accent"
                        animate={{ width: `${((phase + 1) / PHASES.length) * 100}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </Card>

        {desktop && <Card className="max-h-[680px] self-start overflow-y-auto">{panel}</Card>}
      </div>

      {!desktop && (
        <>
          <Drawer open={drawer === 'palette'} title="Components" onClose={() => setDrawer(null)}>
            <Palette onAdd={addCentered} />
          </Drawer>
          <Drawer open={drawer === 'panel'} title={challenge.title} onClose={() => setDrawer(null)}>
            <div className="-m-4">{panel}</div>
          </Drawer>
        </>
      )}

      <div ref={resultsRef} className="scroll-mt-20 pt-6">
        {current ? (
          <EvaluationResults
            challenge={challenge}
            current={current}
            previous={previous}
            stale={stale}
            shareStatus={status}
            onFocusNodes={focusNodes}
            onImprove={() => canvasRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })}
            onShare={share}
            onDownloadCard={downloadCard}
          />
        ) : (
          <p className="text-center text-[13px] text-fg-subtle">
            Build your design, then press <span className="font-medium text-fg">Evaluate Architecture</span> to see how it holds
            up.
          </p>
        )}
      </div>
    </div>
  )
}
