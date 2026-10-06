import { UnderConstruction } from '@/components/layout/UnderConstruction'

export default function ResiliencePlayground() {
  return (
    <UnderConstruction
      eyebrow="Experiment 02"
      title="Resilience Playground"
      description="Inject failures into an order pipeline and compare retries, circuit breakers, caching and asynchronous processing."
      upcoming={[
        'Kill Payment or Inventory Service and watch requests fail',
        'Add network latency and dropped requests',
        'Enable retries and see them amplify load',
        'Trip a circuit breaker through CLOSED → OPEN → HALF OPEN → CLOSED',
      ]}
    />
  )
}
