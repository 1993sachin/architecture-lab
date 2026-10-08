import { useEffect, useId, useRef, type ReactNode } from 'react'
import { m } from 'framer-motion'
import { cn } from '@/lib/cn'
import type { Tone } from '@/lib/incident/session'

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-healthy',
  warn: 'text-warning',
  bad: 'text-failed',
  neutral: 'text-fg',
}

export const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--healthy)',
  warn: 'var(--warning)',
  bad: 'var(--failed)',
  neutral: 'var(--fg-subtle)',
}

export const HEALTH_DOT: Record<string, string> = {
  healthy: 'bg-healthy',
  degraded: 'bg-degraded',
  unhealthy: 'bg-warning',
  down: 'bg-failed',
}

/** Small uppercase label used for panel headings across the runner. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-mono text-[11px] font-medium tracking-wide text-fg-subtle uppercase', className)}>{children}</p>
}

interface ModalProps {
  title: ReactNode
  /** Accessible name when the visible title is not plain text. */
  label?: string
  onClose?: () => void
  children: ReactNode
  tone?: 'default' | 'alert' | 'warning'
  className?: string
}

/**
 * Centered dialog. Escape closes it when `onClose` is given; alerts that must be
 * acknowledged omit `onClose` so the operator has to use a button.
 */
export function Modal({ title, label, onClose, children, tone = 'default', className }: ModalProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>('textarea, button:not([disabled]), [href], input')
    first?.focus()
    if (!onClose) return () => previous?.focus?.()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby={label ? undefined : titleId} aria-label={label}>
      <m.div className="fixed inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <m.div
        ref={panel}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className={cn(
          'relative w-full max-w-lg rounded-xl border bg-surface shadow-2xl',
          tone === 'alert' ? 'border-failed/60' : tone === 'warning' ? 'border-warning/60' : 'border-border',
          className,
        )}
      >
        <div id={titleId} className="contents">
          {title}
        </div>
        {children}
      </m.div>
    </div>
  )
}
