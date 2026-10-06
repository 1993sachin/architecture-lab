import { useEffect } from 'react'

/**
 * Marks the real controls a guide step is about (`data-guide-target`) with
 * `data-guide-highlight`, so they get a dashed outline. The guide text always
 * names the control too, so the highlight is never the only cue.
 */
export function useGuideHighlight(targets: string[]) {
  const key = targets.join('|')
  useEffect(() => {
    if (!key) return
    const ids = key.split('|')
    const apply = () => {
      document.querySelectorAll('[data-guide-highlight]').forEach((el) => {
        if (!ids.includes(el.getAttribute('data-guide-target') ?? '')) el.removeAttribute('data-guide-highlight')
      })
      for (const id of ids)
        document.querySelectorAll(`[data-guide-target="${id}"]`).forEach((el) => el.setAttribute('data-guide-highlight', ''))
    }
    apply()
    // Controls can mount later (a drawer opens, a panel expands), so keep the marks current.
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      document.querySelectorAll('[data-guide-highlight]').forEach((el) => el.removeAttribute('data-guide-highlight'))
    }
  }, [key])
}
