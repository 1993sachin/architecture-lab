import { UnderConstruction } from '@/components/layout/UnderConstruction'

export default function ADRs() {
  return (
    <UnderConstruction
      eyebrow="Decisions"
      title="Architecture Decision Records"
      description="The decisions behind Architecture Lab itself, written as ADRs."
      upcoming={[
        'ADR-001: Choosing Microfrontend Architecture',
        'ADR-002: Choosing React + TypeScript',
        'ADR-003: Choosing React Flow for Visualization',
        'ADR-004: Static-first Architecture for MVP',
      ]}
    />
  )
}
