import { useEffect, useId, type ReactNode } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from './Button'

interface DrawerProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Bottom sheet for small screens. Escape or the backdrop closes it. */
export function Drawer({ open, title, onClose, children }: DrawerProps) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <m.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <m.div
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col supports-[height:100dvh]:max-h-[85dvh] rounded-t-xl border-t border-border bg-surface shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h2 id={titleId} className="text-[13px] font-semibold text-fg">
                {title}
              </h2>
              <IconButton label="Close" onClick={onClose}>
                <X className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  )
}
