import { UnderConstruction } from '@/components/layout/UnderConstruction'

export default function Notebook() {
  return (
    <UnderConstruction
      eyebrow="Notebook"
      title="Architect’s Notebook"
      description="Short, practical essays on architectural trade-offs."
      upcoming={[
        'Monolith vs Microservices',
        'Retry vs Circuit Breaker',
        'Synchronous vs Asynchronous Communication',
        'RAG vs Agents, and more',
      ]}
    />
  )
}
