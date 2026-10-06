import type { TradeoffItem } from '@/components/experiment/TradeoffPanel'

export const MFE_TRADEOFFS: { advantages: TradeoffItem[]; costs: TradeoffItem[] } = {
  advantages: [
    {
      title: 'Independent deployment',
      body: 'Each team ships on its own schedule. A release touches one module, not the whole application.',
    },
    { title: 'Team autonomy', body: 'Teams own their module end to end: stack choices, release cadence and on-call.' },
    { title: 'Isolated failures', body: 'A broken module degrades one slot of the page instead of taking everything down.' },
  ],
  costs: [
    { title: 'Operational complexity', body: 'More pipelines, more deployments, versioned contracts between shell and remotes.' },
    { title: 'Network communication', body: 'Remote modules are fetched at runtime, adding hops and making latency hurt more.' },
    {
      title: 'Duplicate dependencies',
      body: 'Without careful sharing, users download React and design-system code more than once.',
    },
    { title: 'Harder debugging', body: 'A bug can span the shell, several remotes and their APIs, each with its own version.' },
  ],
}

export const MONOLITH_TRADEOFFS: { advantages: TradeoffItem[]; costs: TradeoffItem[] } = {
  advantages: [
    { title: 'Simple to build and run', body: 'One repository, one pipeline, one deployment. Very little infrastructure.' },
    { title: 'Fast in-process calls', body: 'Modules call each other directly, with no remote fetches or extra network hops.' },
    { title: 'Easy debugging', body: 'One stack trace, one version, one place to look.' },
  ],
  costs: [
    { title: 'Shared blast radius', body: 'A fatal error in any module can take the entire application down.' },
    {
      title: 'Coupled releases',
      body: 'Every change ships with everyone else’s. One bad commit blocks or rolls back all teams.',
    },
    { title: 'Scaling teams is hard', body: 'As the codebase grows, teams step on each other and builds get slower.' },
  ],
}
