import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ExplainableProps {
  /** Accessible name of the trigger, e.g. "Explain p99 latency". */
  label: string
  /** Title of the popover. */
  title: string
  /** Trigger content. */
  children: ReactNode
  /** Popover content, built only while open. */
  content: () => ReactNode
  className?: string
  /** Shown on hover: a one-line tooltip. */
  hint?: string
  /** Called each time the panel opens. */
  onOpen?: () => void
}

/**
 * A trigger that opens a small anchored panel. It does not block the page:
 * the incident stays visible and the panel closes on Escape, on a click
 * elsewhere, or with its close button.
 */
export function Explainable({ label, title, children, content, className, hint, onOpen }: ExplainableProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={hint}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen(!open)
        }}
        className={cn('cursor-help', className)}
      >
        {children}
      </button>
      {open && (
        <Popover anchor={anchor} title={title} onClose={close}>
          {content()}
        </Popover>
      )}
    </>
  )
}

interface PopoverProps {
  anchor: React.RefObject<HTMLElement | null>
  title: string
  onClose: () => void
  children: ReactNode
}

const GAP = 6
const MARGIN = 12

export function Popover({ anchor, title, onClose, children }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' })

  const place = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(380, window.innerWidth - MARGIN * 2)
    const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - width - MARGIN)
    const below = window.innerHeight - rect.bottom - GAP - MARGIN
    const above = rect.top - GAP - MARGIN
    setStyle(
      below >= 420 || below >= above
        ? { left, width, top: rect.bottom + GAP, maxHeight: Math.max(below, 160) }
        : { left, width, bottom: window.innerHeight - rect.top + GAP, maxHeight: above },
    )
  }, [anchor])

  useLayoutEffect(place, [place])

  useEffect(() => {
    const trigger = anchor.current
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !trigger?.contains(target)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      trigger?.focus()
    }
  }, [anchor, onClose, place])

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={style}
      className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-border-strong bg-surface text-left shadow-2xl outline-none"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <p id={titleId} className="text-sm font-semibold text-fg">
          {title}
        </p>
        <button type="button" aria-label="Close" onClick={onClose} className="-mr-1 rounded p-0.5 text-fg-subtle hover:text-fg">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="overflow-y-auto px-3.5 py-3">{children}</div>
    </div>,
    document.body,
  )
}
