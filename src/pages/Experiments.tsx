import { experiments } from '@/data/experiments'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { ExperimentCard } from '@/components/home/ExperimentCard'

export default function Experiments() {
  useDocumentTitle('Experiments')
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Experiments"
        title="Experiments"
        description="Small, live systems you can break on purpose. Each one has controls, live metrics, an explanation of what happened, and the trade-offs behind it."
      />
      <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {experiments.map((exp) => (
          <li key={exp.id}>
            <ExperimentCard experiment={exp} />
          </li>
        ))}
      </ul>
    </div>
  )
}
