import { useEffect, useRef } from 'react'

/** Calls `callback` every `delay` ms while `delay` is not null. Pauses when the tab is hidden. */
export function useInterval(callback: () => void, delay: number | null) {
  const saved = useRef(callback)
  useEffect(() => {
    saved.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') saved.current()
    }, delay)
    return () => {
      window.clearInterval(id)
    }
  }, [delay])
}
