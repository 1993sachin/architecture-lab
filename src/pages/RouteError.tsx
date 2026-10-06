import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/Button'

/**
 * Route-level error boundary. Rendered outside AppShell so it still works
 * when the shell itself is what failed.
 */
export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-16">
      <p className="font-mono text-xs text-failed">500 · unhandled_exception</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg">Something in the lab failed.</h1>
      <p className="mt-2 text-[15px] text-fg-muted">
        This page hit an unexpected error. Reloading usually fixes it. If it keeps happening, please open an issue with the
        details below.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-md border border-border bg-surface p-4 text-xs text-fg-muted">{message}</pre>
      <div className="mt-6 flex gap-3">
        <Button variant="primary" onClick={() => window.location.reload()}>
          <RotateCcw className="size-4" aria-hidden="true" /> Reload
        </Button>
        <a href="#/" className={buttonClasses('secondary')}>
          Back to the lab
        </a>
      </div>
    </main>
  )
}
