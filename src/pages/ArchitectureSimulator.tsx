import { useCallback, useEffect } from 'react'
import { ArrowRight, GraduationCap } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { decodeArchitecture, getChallenge, type Challenge } from '@/lib/architecture'
import { useSimulatorStore } from '@/store/simulatorStore'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ExperimentHeader } from '@/components/experiment/ExperimentHeader'
import { ChallengeDetails } from '@/components/simulator/ChallengeDetails'
import { ChallengeList } from '@/components/simulator/ChallengeList'
import { Designer } from '@/components/simulator/Designer'
import { SIMULATOR_HELP } from '@/components/simulator/help'
import { WALKTHROUGH_CHALLENGE, WALKTHROUGH_ID } from '@/components/simulator/walkthrough'
import { ContextualHelp } from '@/components/guide/ContextualHelp'
import { TrySomething, type TryIdea } from '@/components/guide/TrySomething'
import { Button } from '@/components/ui/Button'
import { useGuideStore } from '@/store/guideStore'

/**
 * Three views driven by the URL, so every step can be linked to:
 *   (none)                      → pick a challenge
 *   ?challenge=id               → the challenge brief
 *   ?challenge=id&view=design   → the designer
 *   ?challenge=id&architecture= → a shared design, loaded then shown in the designer
 */
export default function ArchitectureSimulator() {
  const [params, setParams] = useSearchParams()
  const challenge = getChallenge(params.get('challenge') ?? '')
  const shared = params.get('architecture')
  const view = params.get('view')
  const guided = challenge?.id === WALKTHROUGH_CHALLENGE && view === 'guided'
  const designing = !!challenge && (view === 'design' || guided || !!shared)
  const walkthroughDone = useGuideStore((s) => !!s.completed[WALKTHROUGH_ID])
  const shortenerDraft = useSimulatorStore((s) => (s.drafts[WALKTHROUGH_CHALLENGE]?.nodes.length ?? 0) > 1)
  const hasDraft = useSimulatorStore((s) => (challenge ? (s.drafts[challenge.id]?.nodes.length ?? 0) > 1 : false))
  useDocumentTitle(challenge ? `${challenge.title} · Architecture Decision Simulator` : 'Architecture Decision Simulator')

  // A share link carries the whole design; load it once, then drop it from the URL so edits are not overwritten.
  useEffect(() => {
    if (!shared) return
    const arch = decodeArchitecture(shared)
    if (arch && (!challenge || arch.challengeId === challenge.id)) useSimulatorStore.getState().load(arch)
    const id = arch?.challengeId ?? challenge?.id
    setParams(id ? { challenge: id, view: 'design' } : {}, { replace: true })
  }, [shared, challenge, setParams])

  const go = useCallback(
    (next: Record<string, string>) => {
      setParams(next)
      window.scrollTo({ top: 0 })
    },
    [setParams],
  )

  const walkMeThrough = () => {
    useGuideStore.getState().start(WALKTHROUGH_ID)
    go({ challenge: WALKTHROUGH_CHALLENGE, view: 'guided' })
  }
  const ideas: TryIdea[] = [
    {
      id: 'four',
      text: 'Try designing the URL Shortener with only 4 components.',
      watch: 'what the evaluator says is missing, and what it does not miss',
      run: () => go({ challenge: 'url-shortener', view: 'design' }),
    },
    {
      id: 'chat',
      text: 'Design Real-Time Chat without a message broker.',
      watch: 'how the evaluator treats fan-out and delivery',
      run: () => go({ challenge: 'realtime-chat', view: 'design' }),
    },
    {
      id: 'video',
      text: 'Design the Video Learning Platform, then evaluate it with and without a CDN.',
      watch: 'performance and cost in the before/after table',
      run: () => go({ challenge: 'video-platform', view: 'design' }),
    },
    {
      id: 'ecommerce',
      text: 'Build the E-Commerce checkout with a single database, then replicate it.',
      watch: 'reliability against cost',
      run: () => go({ challenge: 'ecommerce', view: 'design' }),
    },
  ]

  return (
    <div className="container-page max-w-[1400px] py-8 sm:py-10">
      {designing && challenge ? (
        <Designer
          key={`${challenge.id}-${guided ? 'guided' : 'design'}`}
          challenge={challenge}
          walkthrough={guided}
          onExitWalkthrough={() => setParams({ challenge: challenge.id, view: 'design' }, { replace: true })}
          onBack={() => go({ challenge: challenge.id })}
          onSwitchChallenge={(id) => go({ challenge: id, view: 'design' })}
        />
      ) : challenge ? (
        <ChallengeDetails
          challenge={challenge}
          hasDraft={hasDraft}
          onBack={() => go({})}
          onStart={() => go({ challenge: challenge.id, view: 'design' })}
        />
      ) : (
        <>
          <ExperimentHeader
            eyebrow="Experiment 03"
            difficulty="Advanced"
            title="Architecture Decision Simulator"
            description="Design systems. Make trade-offs. See how your architecture holds up."
            actions={<ContextualHelp content={SIMULATOR_HELP} />}
          >
            <TrySomething ideas={ideas} className="mt-5" />
          </ExperimentHeader>

          <div className="mt-6 flex flex-col gap-4 rounded-lg border border-accent/40 bg-accent-soft/40 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                <GraduationCap className="size-4 text-accent" aria-hidden="true" /> Not sure where to start?
                {walkthroughDone && <span className="font-mono text-[11px] font-normal text-accent">✓ completed</span>}
              </p>
              <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-fg-muted">
                We’ll design a URL Shortener together: you choose each building block, connect it, and evaluate it with the real
                evaluator.
                {shortenerDraft && ' Starting replaces your saved URL Shortener draft.'}
              </p>
            </div>
            <Button variant="primary" onClick={walkMeThrough} className="shrink-0">
              {walkthroughDone ? 'Walk me through it again' : 'Walk me through one'}{' '}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <h2 className="mt-10 text-lg font-semibold tracking-tight text-fg">What do you want to design?</h2>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-fg-muted">
            Pick a challenge. There is no single correct answer: every choice buys something and costs something.
          </p>
          <div className="mt-5">
            <ChallengeList onOpen={(c: Challenge) => go({ challenge: c.id })} />
          </div>
        </>
      )}
    </div>
  )
}
