import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { decodeArchitecture, getChallenge, type Challenge } from '@/lib/architecture'
import { useSimulatorStore } from '@/store/simulatorStore'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ExperimentHeader } from '@/components/experiment/ExperimentHeader'
import { ChallengeDetails } from '@/components/simulator/ChallengeDetails'
import { ChallengeList } from '@/components/simulator/ChallengeList'
import { Designer } from '@/components/simulator/Designer'

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
  const designing = !!challenge && (params.get('view') === 'design' || !!shared)
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

  return (
    <div className="container-page max-w-[1400px] py-8 sm:py-10">
      {designing && challenge ? (
        <Designer
          key={challenge.id}
          challenge={challenge}
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
            eyebrow="Simulator"
            title="Architecture Decision Simulator"
            description="Design systems. Make trade-offs. See how your architecture holds up."
          />
          <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-fg-muted">
            Pick a challenge, build an architecture from real components, and get an explainable evaluation across six dimensions.
            There is no single correct answer: every choice buys something and costs something.
          </p>
          <div className="mt-6">
            <ChallengeList onOpen={(c: Challenge) => go({ challenge: c.id })} />
          </div>
        </>
      )}
    </div>
  )
}
