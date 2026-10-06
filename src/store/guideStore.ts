import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { emptyContext, type GuideContext } from '@/lib/guide/types'

export type ExperienceMode = 'guided' | 'free'

/** A guide run in progress. Kept for the session only, so a reload starts the steps again. */
export interface GuideRun {
  step: number
  /** Index of the furthest step whose validation has passed (it stays passed). */
  passed: number
  done: boolean
  /** The visitor closed the completion card. */
  dismissed: boolean
  ctx: GuideContext
}

interface GuideStore {
  /** Guides finished at least once. Finishing one makes Free Explore the default there. */
  completed: Record<string, boolean>
  /** The mode the visitor last chose per experiment. */
  modes: Record<string, ExperienceMode>
  runs: Record<string, GuideRun>
  /** Simulator Coach Mode: asks a question whenever a component is added. */
  coach: boolean

  setCoach: (on: boolean) => void
  setMode: (id: string, mode: ExperienceMode) => void
  start: (id: string) => void
  pass: (id: string, step: number) => void
  next: (id: string, total: number) => void
  answer: (id: string, question: string, choice: string) => void
  flag: (id: string, flag: string) => void
  complete: (id: string) => void
  dismiss: (id: string) => void
}

const freshRun = (): GuideRun => ({ step: 0, passed: -1, done: false, dismissed: false, ctx: emptyContext() })

export const useGuideStore = create<GuideStore>()(
  persist(
    (set) => {
      const patchRun = (id: string, fn: (run: GuideRun) => GuideRun) =>
        set((s) => ({ runs: { ...s.runs, [id]: fn(s.runs[id] ?? freshRun()) } }))
      return {
        completed: {},
        modes: {},
        runs: {},
        coach: false,

        setCoach: (coach) => set({ coach }),
        setMode: (id, mode) => set((s) => ({ modes: { ...s.modes, [id]: mode } })),
        start: (id) => set((s) => ({ runs: { ...s.runs, [id]: freshRun() }, modes: { ...s.modes, [id]: 'guided' } })),
        pass: (id, step) => patchRun(id, (r) => (r.passed >= step ? r : { ...r, passed: step })),
        next: (id, total) => patchRun(id, (r) => (r.step + 1 >= total ? { ...r, done: true } : { ...r, step: r.step + 1 })),
        answer: (id, question, choice) =>
          patchRun(id, (r) => ({ ...r, ctx: { ...r.ctx, answers: { ...r.ctx.answers, [question]: choice } } })),
        flag: (id, flag) => patchRun(id, (r) => ({ ...r, ctx: { ...r.ctx, flags: { ...r.ctx.flags, [flag]: true } } })),
        // Finishing clears an explicit "guided" choice, so the next visit opens in Free Explore.
        complete: (id) =>
          set((s) => {
            const modes = { ...s.modes }
            delete modes[id]
            return { completed: { ...s.completed, [id]: true }, modes }
          }),
        dismiss: (id) => {
          patchRun(id, (r) => ({ ...r, dismissed: true }))
          set((s) => ({ modes: { ...s.modes, [id]: 'free' } }))
        },
      }
    },
    {
      name: 'architecture-lab:guide',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Progress and preferences persist; an unfinished run does not.
      partialize: (s) => ({ completed: s.completed, modes: s.modes, coach: s.coach }),
    },
  ),
)

/** First visit: Guided Mode. After finishing (or choosing Free Explore once): Free Explore. */
export function useExperienceMode(id: string): [ExperienceMode, (mode: ExperienceMode) => void] {
  const stored = useGuideStore((s) => s.modes[id])
  const completed = useGuideStore((s) => !!s.completed[id])
  const setMode = useGuideStore((s) => s.setMode)
  const mode = stored ?? (completed ? 'free' : 'guided')
  return [mode, (m) => setMode(id, m)]
}

export const useGuideRun = (id: string) => useGuideStore((s) => s.runs[id]) ?? STABLE_FRESH

const STABLE_FRESH = freshRun()
