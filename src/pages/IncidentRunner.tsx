import { useEffect } from 'react'
import { FastForward, Repeat, StepForward, X } from 'lucide-react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Button } from '@/components/ui/Button'
import { ActionsPanel } from '@/components/incident/ActionsPanel'
import { ConstraintAlert, PageAlert } from '@/components/incident/Alerts'
import { Briefing } from '@/components/incident/Briefing'
import { DecisionDialog } from '@/components/incident/DecisionDialog'
import { IncidentHeader } from '@/components/incident/IncidentHeader'
import { IncidentTimeline } from '@/components/incident/IncidentTimeline'
import { KnowledgePanel } from '@/components/incident/KnowledgePanel'
import { Postmortem } from '@/components/incident/Postmortem'
import { CausesPanel } from '@/components/incident/CausesPanel'
import { SituationPanel } from '@/components/incident/SituationPanel'
import { IncidentImpact } from '@/components/incident/StatusPanels'
import { TopologyView } from '@/components/incident/TopologyView'
import { TransitionCard } from '@/components/incident/TransitionCard'
import { GuidancePanel } from '@/components/incident/GuidancePanel'
import { LearningContext } from '@/components/incident/Learn'
import { explainSymptom, hypotheses, hypothesisOptions, situation, stage, yourMove } from '@/lib/incident/reasoning'
import { guidanceContext } from '@/lib/incident/guidance/context'
import { newClue } from '@/lib/incident/guidance/clues'
import { investigateFirst } from '@/lib/incident/guidance/hints'
import { MODES } from '@/lib/incident/guidance/modes'
import { objectiveResult } from '@/lib/incident/guidance/objectives'
import { detectStruggle } from '@/lib/incident/guidance/struggle'
import { useIncidentStore } from '@/store/incidentStore'

/**
 * The Incident Runner: one incident, played as a sequence of decisions.
 * Renders the store's view of the engine and dispatches moves; it holds no
 * simulation logic of its own.
 */
export default function IncidentRunner() {
  useDocumentTitle('Incident Runner')
  const store = useIncidentStore()
  // On narrow screens the actions sit right under the impact, not below everything else.
  const wide = useMediaQuery('(min-width: 1024px)')
  const { session, phase, view, transition, pending, constraintAlert, rejection, replay, hypothesis, transitionHypothesis, mode: modeId, objective, transitionObjective } = store
  const mode = MODES[modeId]
  // Each phase (briefing, incident, postmortem) is a new screen: start it at the top.
  useEffect(() => {
    document.documentElement.scrollTop = 0
  }, [phase])

  if (phase === 'briefing') {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Briefing scenario={session.scenario} view={view} mode={modeId} onMode={store.setMode} onStart={store.start} />
      </div>
    )
  }

  if (phase === 'postmortem') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Postmortem key={session.actions().length} scenario={session.scenario} simulation={session.simulation()} used={store.guidance.used} onRunAgain={store.runAgain} onReplay={store.replayDecisions} />
      </div>
    )
  }

  // The reasoning layer: built only from the view, which holds nothing the operator cannot see.
  const causes = hypotheses(view)
  const when = stage(view)
  const live = !replay && !view.complete
  const breached = view.slos.some((slo) => slo.breached)
  // Guidance reads the same view plus what the operator has done; it never acts on its own.
  const context = guidanceContext(view, store.guidance, causes)
  const struggle = detectStruggle(context)
  const showPrompt = struggle.struggling && store.guidance.outcomes.length > store.promptDismissedAt
  const actions = live ? (
    <ActionsPanel
      view={view}
      move={mode.yourMove ? yourMove(view, causes) : null}
      hypotheses={mode.yourMove && breached ? hypothesisOptions(causes) : []}
      hypothesis={hypothesis}
      onHypothesis={store.setHypothesis}
      explain={when === 'early'}
      guides={mode.concepts}
      guidance={
        mode.hints && breached ? (
          <GuidancePanel
            context={context}
            hint={store.hintOpen ? store.hint : null}
            struggle={showPrompt ? struggle : null}
            onHint={store.askHint}
            onCloseHint={store.closeHint}
            onDismissPrompt={store.dismissPrompt}
            onReasoningFlow={store.noteReasoningFlow}
            onSelect={store.select}
          />
        ) : null
      }
      onSelect={store.select}
      onWait={store.wait}
      onFinish={store.finish}
    />
  ) : null
  const check = live ? store.select : undefined

  return (
    <LearningContext.Provider value={{ enabled: mode.concepts, onOpen: store.noteExplanation }}>
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        <IncidentHeader title={session.scenario.title} view={view} />
        {replay && <ReplayBar />}
        {rejection && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-failed/50 bg-failed/10 p-3 text-sm">
            <p className="text-fg">
              <span className="font-medium text-failed">Decision refused.</span> {rejection}
            </p>
            <button type="button" aria-label="Dismiss" onClick={store.dismissRejection} className="text-fg-subtle hover:text-fg">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            {/* In the main column, so the decision panel beside it stays at the top of the screen. */}
            {transition && phase === 'running' && (
              <TransitionCard
                transition={transition}
                hypothesis={transitionHypothesis}
                why={mode.consequenceWhy}
                objective={objectiveResult(transitionObjective, transition)}
                clue={mode.hints ? newClue(transition) : null}
                onPostmortem={replay ? undefined : store.openPostmortem}
              />
            )}
            <IncidentImpact view={view} causes={causes} onCheck={check} />
            {mode.interpretation && <SituationPanel lines={situation(view, causes)} why={explainSymptom(view, causes)} expanded={when === 'early'} />}
            <div className={mode.interpretation ? 'grid gap-4 md:grid-cols-2' : undefined}>
              <KnowledgePanel view={view} causes={causes} onInvestigate={check} />
              {mode.interpretation && <CausesPanel causes={causes} onCheck={check} compact={when === 'late'} />}
            </div>
            {!wide && actions}
            <div className="grid gap-4 md:grid-cols-2">
              <TopologyView topology={view.topology} />
              <IncidentTimeline entries={view.timeline} />
            </div>
          </div>
          <div className="space-y-4">
            {wide && actions}
            {!replay && view.complete && (
              <div className="rounded-lg border border-border bg-surface p-4 text-sm">
                <p className="text-fg">The incident is over.</p>
                <Button variant="primary" className="mt-3" onClick={store.openPostmortem}>
                  Read the postmortem
                </Button>
              </div>
            )}
          </div>
        </div>
        {phase === 'paged' && <PageAlert view={view} transition={transition} onAcknowledge={store.acknowledgePage} />}
        {pending && (
          <DecisionDialog
            key={pending.id}
            action={pending}
            view={view}
            causes={causes}
            hypothesis={hypothesis}
            mode={mode}
            objective={objective}
            onObjective={store.setObjective}
            nudge={mode.hints ? investigateFirst(pending, context) : null}
            onSwitch={store.select}
            onCancel={store.cancel}
            onConfirm={store.confirm}
          />
        )}
        {constraintAlert && phase === 'running' && !pending && <ConstraintAlert change={constraintAlert} view={view} onDismiss={store.dismissConstraint} />}
      </div>
    </LearningContext.Provider>
  )
}

function ReplayBar() {
  const replay = useIncidentStore((state) => state.replay)
  const step = useIncidentStore((state) => state.replayStep)
  const all = useIncidentStore((state) => state.replayAll)
  const open = useIncidentStore((state) => state.openPostmortem)
  if (!replay) return null
  const done = replay.cursor >= replay.moves.length
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-info/40 bg-info/5 p-3 text-sm" data-testid="replay-bar">
      <Repeat className="size-4 text-info" aria-hidden="true" />
      <p className="text-fg">
        Replaying your decisions on a fresh simulation · move {replay.cursor} of {replay.moves.length}
      </p>
      {done ? (
        <>
          <p className={replay.identical ? 'font-medium text-healthy' : 'font-medium text-failed'} data-testid="replay-verdict">
            {replay.identical ? 'Identical result: same decisions, same incident.' : 'The replay diverged from your run.'}
          </p>
          <Button size="sm" variant="primary" onClick={open}>
            Back to the postmortem
          </Button>
        </>
      ) : (
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={step}>
            <StepForward className="size-3.5" aria-hidden="true" />
            Next move
          </Button>
          <Button size="sm" variant="ghost" onClick={all}>
            <FastForward className="size-3.5" aria-hidden="true" />
            Replay the rest
          </Button>
        </div>
      )}
    </div>
  )
}
