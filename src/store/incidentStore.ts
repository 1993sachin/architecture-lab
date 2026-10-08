import { create } from 'zustand'
import {
  IncidentSession,
  type ActionView,
  type ConstraintChange,
  type IncidentView,
  type Transition,
} from '@/lib/incident/session'
import { EMPTY_HISTORY, guidanceContext, outcomeOf, type GuidanceHistory } from '@/lib/incident/guidance/context'
import { situationOf, type SituationId } from '@/lib/incident/guidance/situation'
import { nextLevel } from '@/lib/incident/guidance/struggle'
import type { Mode } from '@/lib/incident/guidance/modes'

/**
 * Everything the operator did, as UI-level moves. Replaying the same moves
 * through a fresh session goes through exactly the code path the buttons use.
 */
export type Move =
  | { type: 'start' }
  | { type: 'decide'; decisionId: string; rationale: string }
  | { type: 'wait'; minutes: number }
  | { type: 'finish' }

export interface StatedHypothesis {
  id: string
  label: string
}

/** Which rung of the guidance ladder is showing, and for which situation. */
export interface HintState {
  level: 2 | 3 | 4
  situation: SituationId
}

export type Phase = 'briefing' | 'paged' | 'running' | 'postmortem'

interface ReplayState {
  moves: Move[]
  cursor: number
  /** Serialized engine result of the run being replayed. */
  expected: string
  /** Set once every move has been replayed. */
  identical: boolean | null
}

interface IncidentStore {
  session: IncidentSession
  phase: Phase
  view: IncidentView
  /** The last thing that happened, shown as a before → after card. */
  transition: Transition | null
  /** Decision awaiting confirmation. */
  pending: ActionView | null
  /** A constraint that just changed; shown prominently until acknowledged. */
  constraintAlert: ConstraintChange | null
  /** Why the engine refused the last decision. */
  rejection: string | null
  moves: Move[]
  replay: ReplayState | null
  /** What the operator says they think is going on. Never sent to the engine; it only frames their own reasoning. */
  hypothesis: StatedHypothesis | null
  /** The hypothesis they held when they made the move shown in `transition`. */
  transitionHypothesis: StatedHypothesis | null

  /** How much the runner helps. Never sent to the engine and never scored. */
  mode: Mode
  /** What the operator did and what it did to the system, plus the help they asked for. Read by guidance only. */
  guidance: GuidanceHistory
  hint: HintState | null
  /** Whether the hint card is showing. A move closes it; the ladder position is kept for the next ask. */
  hintOpen: boolean
  /** The struggle prompt was dismissed after this many moves; it stays away until something new happens. */
  promptDismissedAt: number
  /** What the operator says they are trying to improve with the next decision. Optional. */
  objective: string | null
  /** The objective they had for the move shown in `transition`. */
  transitionObjective: string | null

  setHypothesis: (hypothesis: StatedHypothesis | null) => void
  setMode: (mode: Mode) => void
  setObjective: (objective: string | null) => void
  /** Climb one rung of the ladder (or start at the hint when the situation changed). */
  askHint: (stuck?: boolean) => void
  closeHint: () => void
  dismissPrompt: () => void
  noteReasoningFlow: () => void
  noteExplanation: (id: string) => void
  start: () => void
  acknowledgePage: () => void
  select: (decisionId: string) => void
  cancel: () => void
  confirm: (rationale: string) => boolean
  wait: (minutes: number) => void
  finish: () => void
  dismissConstraint: () => void
  dismissRejection: () => void
  openPostmortem: () => void
  runAgain: () => void
  replayDecisions: () => void
  replayStep: () => void
  replayAll: () => void
}

function fresh() {
  const session = new IncidentSession()
  return {
    session,
    phase: 'briefing' as Phase,
    view: session.view(),
    transition: null,
    pending: null,
    constraintAlert: null,
    rejection: null,
    moves: [] as Move[],
    replay: null,
    hypothesis: null,
    transitionHypothesis: null,
    guidance: EMPTY_HISTORY,
    hint: null,
    hintOpen: false,
    promptDismissedAt: 0,
    objective: null,
    transitionObjective: null,
  }
}

/** Applies a move to a session. Shared by live play and replay. */
function perform(session: IncidentSession, move: Move): { transition: Transition | null; rejection: string | null } {
  switch (move.type) {
    case 'start':
      return { transition: session.startIncident(), rejection: null }
    case 'wait':
      return { transition: session.wait(move.minutes), rejection: null }
    case 'finish':
      return { transition: session.finish(), rejection: null }
    case 'decide': {
      const result = session.decide(move.decisionId, move.rationale)
      return result.status === 'applied' ? { transition: result.transition, rejection: null } : { transition: null, rejection: result.reason }
    }
  }
}

export const useIncidentStore = create<IncidentStore>((set, get) => {
  /** Runs a live move and records it. */
  const play = (move: Move, extra: Partial<IncidentStore> = {}) => {
    const { session, moves, guidance } = get()
    const { transition, rejection } = perform(session, move)
    const decided = transition !== null && move.type === 'decide'
    set({
      view: session.view(),
      moves: [...moves, move],
      transition: transition ?? get().transition,
      constraintAlert: transition?.constraintChanges[0] ?? null,
      rejection,
      guidance: {
        ...guidance,
        outcomes: transition ? [...guidance.outcomes, outcomeOf(transition)] : guidance.outcomes,
        rejections: guidance.rejections + (rejection === null ? 0 : 1),
      },
      // A decision is judged against what the operator believed when they made it; waiting is not.
      ...(transition ? { transitionHypothesis: decided ? get().hypothesis : null, transitionObjective: decided ? get().objective : null } : {}),
      ...(decided ? { hypothesis: null, objective: null } : {}),
      ...(transition ? { hintOpen: false } : {}),
      ...extra,
    })
    return rejection === null
  }

  return {
    ...fresh(),
    mode: 'guided',

    start: () => {
      play({ type: 'start' }, { phase: 'paged' })
    },
    acknowledgePage: () => set({ phase: 'running' }),
    setHypothesis: (hypothesis) => set({ hypothesis }),
    setMode: (mode) => set({ mode }),
    setObjective: (objective) => set({ objective }),

    askHint: (stuck = false) => {
      const { view, guidance, hint } = get()
      const history = stuck ? { ...guidance, stuck: guidance.stuck + 1 } : guidance
      const situation = situationOf(guidanceContext(view, history))
      // A new situation starts again from the gentlest rung.
      const level = hint && hint.situation === situation ? nextLevel(hint.level) : 2
      const used = { ...history.used }
      if (level === 2) used.hints += 1
      else if (level === 3) used.strongHints += 1
      else used.rescues += 1
      set({ hint: { level, situation }, hintOpen: true, guidance: { ...history, used }, promptDismissedAt: history.outcomes.length })
    },
    closeHint: () => set({ hintOpen: false }),
    dismissPrompt: () => set({ promptDismissedAt: get().guidance.outcomes.length }),
    noteReasoningFlow: () => {
      const { guidance } = get()
      set({ guidance: { ...guidance, used: { ...guidance.used, reasoningFlows: guidance.used.reasoningFlows + 1 } } })
    },
    noteExplanation: (id) => {
      const { guidance } = get()
      set({
        guidance: {
          ...guidance,
          explanationOpens: { ...guidance.explanationOpens, [id]: (guidance.explanationOpens[id] ?? 0) + 1 },
          used: { ...guidance.used, explanations: guidance.used.explanations + 1 },
        },
      })
    },

    select: (decisionId) => {
      const action = get().view.actions.find((candidate) => candidate.id === decisionId) ?? null
      set({ pending: action, rejection: null })
    },
    cancel: () => set({ pending: null }),
    confirm: (rationale) => {
      const pending = get().pending
      if (!pending || rationale.trim() === '') return false
      return play({ type: 'decide', decisionId: pending.id, rationale: rationale.trim() }, { pending: null })
    },
    wait: (minutes) => {
      play({ type: 'wait', minutes })
    },
    finish: () => {
      play({ type: 'finish' })
    },
    dismissConstraint: () => set({ constraintAlert: null }),
    dismissRejection: () => set({ rejection: null }),
    openPostmortem: () => set({ phase: 'postmortem', pending: null, constraintAlert: null }),

    runAgain: () => set(fresh()),

    replayDecisions: () => {
      const { moves, session, guidance } = get()
      const next = new IncidentSession()
      set({
        ...fresh(),
        // The help used belongs to the run being replayed; the postmortem still reports it.
        guidance: { ...EMPTY_HISTORY, used: guidance.used },
        session: next,
        view: next.view(),
        phase: 'running',
        replay: { moves, cursor: 0, expected: JSON.stringify(session.simulation().getResult()), identical: null },
      })
    },
    replayStep: () => {
      const { replay, session } = get()
      if (!replay || replay.cursor >= replay.moves.length) return
      const move = replay.moves[replay.cursor] as Move
      const { transition } = perform(session, move)
      const cursor = replay.cursor + 1
      const done = cursor >= replay.moves.length
      set({
        view: session.view(),
        moves: [...get().moves, move],
        transition: transition ?? get().transition,
        constraintAlert: null,
        replay: {
          ...replay,
          cursor,
          identical: done ? JSON.stringify(session.simulation().getResult()) === replay.expected : null,
        },
      })
    },
    replayAll: () => {
      while (get().replay && (get().replay as ReplayState).cursor < (get().replay as ReplayState).moves.length) get().replayStep()
    },
  }
})
