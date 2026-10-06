import { useEffect } from 'react'
import { site } from '@/lib/site'

const defaultTitle = `${site.name} — Interactive Software Architecture Playground`

/** Sets a per-page title, restoring the default when the page unmounts. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${site.name}` : defaultTitle
    return () => {
      document.title = defaultTitle
    }
  }, [title])
}
