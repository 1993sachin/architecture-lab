import { ArrowRight, Siren } from 'lucide-react'
import { playground } from '@/data/experiments'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { ExperimentCard } from '@/components/home/ExperimentCard'

export default function Playground() {
  useDocumentTitle('Playground')
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Playground"
        title="Learn the concepts behind the incidents"
        description="Small sandboxes with no clock and no pressure. Break a service, add a circuit breaker, design a system, and see what each choice buys and costs before you need it on call."
        actions={
          <ButtonLink to="/incident" variant="secondary" size="md">
            <Siren className="size-4" aria-hidden="true" /> Start an incident <ArrowRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        }
      />
      <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {playground.map((exp) => (
          <li key={exp.id}>
            <ExperimentCard experiment={exp} />
          </li>
        ))}
      </ul>
    </div>
  )
}
