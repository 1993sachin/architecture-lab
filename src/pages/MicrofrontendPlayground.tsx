import { UnderConstruction } from '@/components/layout/UnderConstruction'

export default function MicrofrontendPlayground() {
  return (
    <UnderConstruction
      eyebrow="Experiment 01"
      title="Microfrontend Playground"
      description="Compare a monolith with independently deployed microfrontends, and see how far a failure spreads."
      upcoming={[
        'Switch between monolith and microfrontend architectures',
        'Take Workspace, Content or Analytics offline',
        'Tune latency, API failure probability, caching and lazy loading',
        'Watch requests, failures, latency and availability update live',
      ]}
    />
  )
}
