import { MFE_PRESETS, type MfeConfig, type ModuleId } from '@/lib/simulation/microfrontend'
import type { GuidedExperimentDef } from '@/lib/guide/types'
import type { HelpContent } from '@/components/guide/ContextualHelp'
import type { TryIdea } from '@/components/guide/TrySomething'
import { useMicrofrontendStore } from '@/store/microfrontendStore'

export interface MfeGuideState {
  config: MfeConfig
}

const isDown = (s: MfeGuideState, id: ModuleId) => s.config.failures.includes(id)
const isMfe = (s: MfeGuideState) => s.config.mode === 'microfrontends'
const toggle = (id: ModuleId) => () => useMicrofrontendStore.getState().toggleModule(id)

export const MFE_GUIDE: GuidedExperimentDef<MfeGuideState> = {
  id: 'microfrontend',
  title: 'Break a microfrontend',
  scenario: 'Can you keep the application running when one team deploys a broken MFE?',
  introduction:
    'Microfrontend architecture is often justified by team independence and failure isolation. Let’s test that idea on the live system below.',
  steps: [
    {
      id: 'disable-workspace',
      title: 'Disable Workspace',
      description: 'The Workspace team just shipped a broken release. Take Workspace offline and watch what the shell does.',
      phase: 'break',
      tasks: [
        {
          id: 'workspace-off',
          label: 'Take Workspace offline',
          done: (s) => isMfe(s) && isDown(s, 'workspace'),
          action: { label: 'Disable Workspace', run: toggle('workspace') },
          target: 'mfe-module-workspace',
        },
      ],
      explanation: 'Workspace failed. Its slot now shows a fallback, and its share of requests turns into errors.',
      observe: 'Notice that Content and Analytics are still available: look at the user view and the diagram.',
      hints: [
        'Look for the Failure simulation controls on the right.',
        'Each module has its own offline toggle under “take modules offline”.',
        'Press “Disable Workspace” here, or the Workspace toggle in the controls.',
      ],
    },
    {
      id: 'disable-content',
      title: 'Now disable Content',
      description: 'A second team has a bad day too. Take Content offline while Workspace is still down.',
      phase: 'observe',
      tasks: [
        {
          id: 'content-off',
          label: 'Take Content offline',
          done: (s) => isMfe(s) && isDown(s, 'content'),
          action: { label: 'Disable Content', run: toggle('content') },
          target: 'mfe-module-content',
        },
      ],
      explanation:
        'Two independent parts have failed. Each one shows its own fallback, and neither took the other modules down with it.',
      observe: 'Analytics is still serving traffic, so the page is degraded rather than dead.',
      hints: [
        'It is the same kind of control you used for Workspace.',
        'Use the Content toggle in the failure controls.',
        'Press “Disable Content”.',
      ],
    },
    {
      id: 'restore-workspace',
      title: 'Restore Workspace',
      description: 'The Workspace team rolls back their release. Bring Workspace back online and leave Content broken.',
      phase: 'try-again',
      tasks: [
        {
          id: 'workspace-on',
          label: 'Bring Workspace back online',
          done: (s) => !isDown(s, 'workspace'),
          action: { label: 'Restore Workspace', run: toggle('workspace') },
          target: 'mfe-module-workspace',
        },
      ],
      explanation: 'Workspace recovers on its own. Content is still down, and nothing else had to be rebuilt or redeployed.',
      observe: 'That is independent deployment: one team’s fix ships without waiting for anyone else.',
      hints: ['Undo what you did in step 1.', 'Toggle Workspace again in the failure controls.', 'Press “Restore Workspace”.'],
    },
  ],
  completionMessage:
    'You’ve just experienced one of the key trade-offs of microfrontends: failure isolation and independent deployment come with additional architectural complexity.',
  learned: {
    topic: 'Microfrontends',
    points: [
      { term: 'Independent deployment' },
      { term: 'Failure isolation' },
      { term: 'Team autonomy' },
      { term: 'Added operational complexity' },
    ],
  },
  next: [{ label: 'Try Another Experiment', to: '/experiments/resilience' }],
}

export const MFE_HELP: HelpContent = {
  looking:
    'A live application shell that composes three modules, each owned by a different team. Requests flow through the diagram; the metrics and the user view show what visitors experience.',
  change:
    'Switch between a monolith and microfrontends, take modules offline, add network latency or API failures, and turn caching, lazy loading and independent deployment on or off.',
  tryThis: 'Take Workspace offline in each mode and compare how much of the page survives.',
  learn:
    'How far a failure spreads depends on how the system is split and deployed, and what that isolation costs in complexity.',
}

const preset = (id: string) => MFE_PRESETS.find((p) => p.id === id)!.config
const apply = (config: MfeConfig) => () => useMicrofrontendStore.getState().applyPreset(config)

export const MFE_IDEAS: TryIdea[] = [
  {
    id: 'workspace',
    text: 'Disable Workspace and observe what survives.',
    watch: 'the user view and availability',
    run: apply(preset('isolated-failure')),
  },
  {
    id: 'monolith',
    text: 'Break Workspace in a monolith instead.',
    watch: 'how much of the page goes blank',
    run: apply(preset('monolith-failure')),
  },
  {
    id: 'eager',
    text: 'Eager-load the modules while Analytics is dead.',
    watch: 'latency on pages that have nothing wrong',
    run: apply(preset('eager-dead-remote')),
  },
  {
    id: 'cache',
    text: 'Make the API flaky, then turn caching on.',
    watch: 'failed requests turning into stale cache hits',
    run: apply(preset('flaky-api-cache')),
  },
  {
    id: 'release-train',
    text: 'Break Content and turn off independent deployment.',
    watch: 'errors spreading to healthy modules during the coupled rollback',
    run: () =>
      useMicrofrontendStore
        .getState()
        .applyPreset({ ...preset('isolated-failure'), failures: ['content'], independentDeployment: false }),
  },
]
