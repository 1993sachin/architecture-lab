export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="0.5" y="0.5" width="23" height="23" rx="5" className="fill-surface-2 stroke-border-strong" />
      <path d="M12 8v3M12 11H6.5v3M12 11h5.5v3M12 11v3" className="stroke-fg-subtle" strokeWidth="1.2" fill="none" />
      <rect x="9" y="4.5" width="6" height="3.5" rx="1" className="fill-accent" />
      <rect x="4.5" y="14" width="4" height="3.5" rx="1" className="fill-fg-muted" />
      <rect x="10" y="14" width="4" height="3.5" rx="1" className="fill-fg-muted" />
      <rect x="15.5" y="14" width="4" height="3.5" rx="1" className="fill-failed" />
    </svg>
  )
}
