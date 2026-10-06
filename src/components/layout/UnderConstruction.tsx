import { ArrowLeft, Construction } from 'lucide-react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ButtonLink } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'

interface UnderConstructionProps {
  eyebrow: string
  title: string
  description: string
  /** What the finished page will let the visitor do. */
  upcoming: string[]
}

/** Route placeholder for sections that land in a later build phase. */
export function UnderConstruction({ eyebrow, title, description, upcoming }: UnderConstructionProps) {
  useDocumentTitle(title)
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Card className="bg-grid mt-8 flex flex-col items-start gap-4 p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-degraded/30 bg-degraded/10 px-2.5 py-1 font-mono text-[11px] text-degraded">
          <Construction className="size-3.5" aria-hidden="true" /> In the lab
        </span>
        <p className="text-sm text-fg-muted">This section is being built. When it ships you’ll be able to:</p>
        <ul className="space-y-1.5 text-sm text-fg">
          {upcoming.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-accent" aria-hidden="true">
                ›
              </span>
              {item}
            </li>
          ))}
        </ul>
        <ButtonLink to="/" variant="secondary" size="sm" className="mt-2">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to the lab
        </ButtonLink>
      </Card>
    </div>
  )
}
