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
  /** The actions. Always visible: only the content between title and footer scrolls. */
  footer?: ReactNode
  tone?: 'default' | 'alert' | 'warning'
  className?: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Centered dialog that always fits the viewport: the title and the action
 * footer stay put and the content between them scrolls, so the primary
 * action is reachable on any screen. Focus moves into the dialog, Tab stays
 * inside it, and Escape closes it when `onClose` is given; alerts that must
 * be acknowledged omit `onClose` so the operator has to use a button.
 */
export function Modal({ title, label, onClose, children, footer, tone = 'default', className }: ModalProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const closable = onClose !== undefined
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // Focus the dialog itself, so a long body opens at its top rather than scrolled to a field.
    panel.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && close.current) {
        close.current()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null || item === document.activeElement)
      if (items.length === 0) return
      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panel.current.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [closable])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby={label ? undefined : titleId} aria-label={label}>
      <m.div className="fixed inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <m.div
        ref={panel}
        tabIndex={-1}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className={cn(
          // Fits the dynamic viewport (mobile browser bars included); 100vh is the fallback.
          'relative flex max-h-[calc(100vh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-surface shadow-2xl outline-none supports-[height:100dvh]:max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100vh-2rem)] sm:supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]',
          tone === 'alert' ? 'border-failed/60' : tone === 'warning' ? 'border-warning/60' : 'border-border',
          className,
        )}
      >
        <div id={titleId} className="shrink-0">
          {title}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="modal-body">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-surface" data-testid="modal-footer">
            {footer}
          </div>
        )}
      </m.div>
    </div>
  )
}
