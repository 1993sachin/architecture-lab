import { UnderConstruction } from '@/components/layout/UnderConstruction'

export default function ArchitectureSimulator() {
  return (
    <UnderConstruction
      eyebrow="Simulator"
      title="Architecture Decision Simulator"
      description="Pick a system-design challenge, build an architecture on a canvas, and get scored across six dimensions."
      upcoming={[
        'Choose from challenges like a URL shortener or a video streaming platform',
        'Drag components onto a canvas and connect them',
        'Evaluate scalability, reliability, performance, cost, complexity and maintainability',
        'Share your architecture with a single URL',
      ]}
    />
  )
}
