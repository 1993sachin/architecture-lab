/**
 * Training modes: how much the runner helps. One small table, read by the UI.
 * The simulation is identical in every mode; only the presentation changes.
 */
export type Mode = 'guided' | 'challenge' | 'expert'

export interface ModeConfig {
  id: Mode
  label: string
  summary: string
  /** Hints, "Help me reason", and the struggle prompt. */
  hints: boolean
  /** The "Your move" framing and the hypothesis prompt. */
  yourMove: boolean
  /** "What's happening?" and "What might be causing it?". */
  interpretation: boolean
  /** Concept explanations and what each action is for. */
  concepts: boolean
  /** "Why?" lines and new clues after a move. Without it, only what changed. */
  consequenceWhy: boolean
}

export const MODES: Record<Mode, ModeConfig> = {
  guided: {
    id: 'guided',
    label: 'Guided',
    summary: 'For learning. Explanations, hints and step-by-step reasoning whenever you want them.',
    hints: true,
    yourMove: true,
    interpretation: true,
    concepts: true,
    consequenceWhy: true,
  },
  challenge: {
    id: 'challenge',
    label: 'Challenge',
    summary: 'No hints or prompts. Explanations only when you ask, and every consequence explained.',
    hints: false,
    yourMove: false,
    interpretation: false,
    concepts: true,
    consequenceWhy: true,
  },
  expert: {
    id: 'expert',
    label: 'Expert',
    summary: 'Raw metrics, actions, costs and consequences. No interpretation: you read the system yourself.',
    hints: false,
    yourMove: false,
    interpretation: false,
    concepts: false,
    consequenceWhy: false,
  },
}
