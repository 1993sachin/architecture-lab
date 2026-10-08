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
import { IncidentImpact, SystemStatus } from '@/components/incident/StatusPanels'
import { TopologyView } from '@/components/incident/TopologyView'
import { TransitionCard } from '@/components/incident/TransitionCard'
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
  const { session, phase, view, transition, pending, constraintAlert, rejection, replay } = store

  if (phase === 'briefing') {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Briefing scenario={session.scenario} view={view} onStart={store.start} />
      </div>
    )
  }

  if (phase === 'postmortem') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Postmortem key={session.actions().length} scenario={session.scenario} simulation={session.simulation()} onRunAgain={store.runAgain} onReplay={store.replayDecisions} />
      </div>
    )
  }

  const actions = !replay && !view.complete ? <ActionsPanel view={view} onSelect={store.select} onWait={store.wait} onFinish={store.finish} /> : null

  return (
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
      {transition && phase === 'running' && <TransitionCard transition={transition} onPostmortem={replay ? undefined : store.openPostmortem} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <IncidentImpact view={view} />
          {!wide && actions}
          <SystemStatus view={view} />
          <div className="grid gap-4 md:grid-cols-2">
            <TopologyView topology={view.topology} />
            <KnowledgePanel view={view} />
          </div>
          <IncidentTimeline entries={view.timeline} />
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
      {pending && <DecisionDialog key={pending.id} action={pending} view={view} onCancel={store.cancel} onConfirm={store.confirm} />}
      {constraintAlert && phase === 'running' && !pending && <ConstraintAlert change={constraintAlert} view={view} onDismiss={store.dismissConstraint} />}
    </div>
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
