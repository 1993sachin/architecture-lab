export function PageLoader() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50vh] items-center justify-center">
      <span className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
