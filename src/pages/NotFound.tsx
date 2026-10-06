import { ArrowLeft } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ButtonLink } from '@/components/ui/Button'

export default function NotFound() {
  useDocumentTitle('Not found')
  const { pathname } = useLocation()
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-start justify-center py-16">
      <p className="font-mono text-xs text-failed">404 · route_not_found</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg">This service is offline.</h1>
      <p className="mt-2 max-w-md text-[15px] text-fg-muted">
        Nothing is deployed at <code className="rounded bg-surface-2 px-1 py-0.5 text-[13px]">{pathname}</code>. The rest of
        the lab is still healthy.
      </p>
      <ButtonLink to="/" variant="secondary" className="mt-6">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to the lab
      </ButtonLink>
    </div>
  )
}
