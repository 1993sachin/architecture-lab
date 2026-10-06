import { useEffect, useRef, useState } from 'react'
import type { StepKind, TraceStep } from '@/lib/simulation/resilience'
import { useResilienceStore } from '@/store/resilienceStore'
import { usePrefersReducedMotion } from './useReducedMotion'

/** On-screen time for one hop, ms. Waiting steps linger so a timeout feels slow. */
const STEP_MS: Record<StepKind, number> = {
  request: 300,
  response: 260,
  retry: 420,
  failed: 380,
  timeout: 620,
  'circuit-open': 220,
  'cache-hit': 240,
  'cache-miss': 240,
  enqueue: 300,
}
/** Bursts and auto traffic play faster so many requests stay watchable. */
const FAST_FACTOR = 0.4
/** Pause between consecutive requests of a burst. */
const GAP_MS = 160
const AUTO_TRAFFIC_MS = 700

export interface PlaybackState {
  /** The hop being animated, or null when idle. */
  step: TraceStep | null
  /** Changes for every hop, so edge animations restart. */
  stepKey: string
  /** Seconds the current hop takes on screen. */
  stepSeconds: number
  playing: boolean
}

/**
 * Plays the latest request's trace hop by hop, then sends the next pending
 * request. The engine has already computed the whole trace; this hook only
 * decides when each hop is shown.
 */
export function useRequestPlayback(): PlaybackState {
  const trace = useResilienceStore((s) => s.sim.lastTrace)
  const pending = useResilienceStore((s) => s.pending)
  const autoTraffic = useResilienceStore((s) => s.autoTraffic)
  const dispatchNext = useResilienceStore((s) => s.dispatchNext)
  const queueRequests = useResilienceStore((s) => s.queueRequests)
  const reducedMotion = usePrefersReducedMotion()
  const setPlaying = useResilienceStore((s) => s.setPlaying)

  const [cursor, setCursor] = useState<{ requestId: number; index: number; ms: number } | null>(null)
  // Requests already on screen when the page mounts are not replayed.
  const played = useRef(trace?.requestId ?? 0)
  const fast = useRef(false)
  fast.current = pending > 0 || autoTraffic

  // Keyed on the request id: config changes clone the state (and the trace) but must not restart playback.
  const requestId = trace?.requestId ?? 0
  const traceRef = useRef(trace)
  traceRef.current = trace

  useEffect(() => {
    const current = traceRef.current
    if (!current || requestId === played.current) {
      if (!current) {
        // A reset starts request ids again from 1.
        played.current = 0
        setCursor(null)
      }
      return
    }
    played.current = requestId
    if (reducedMotion) {
      setCursor(null)
      setPlaying(false)
      return
    }
    const factor = fast.current ? FAST_FACTOR : 1
    const steps = current.steps
    let index = 0
    let timer = 0
    const show = () => {
      const step = steps[index]
      if (!step) {
        setCursor(null)
        return
      }
      const ms = Math.round(STEP_MS[step.kind] * factor)
      setCursor({ requestId, index, ms })
      index++
      timer = window.setTimeout(show, ms)
    }
    show()
    return () => {
      window.clearTimeout(timer)
      setCursor(null)
    }
  }, [requestId, reducedMotion, setPlaying])

  const playing = cursor !== null
  // dispatchNext marks the store as playing; this releases it when the animation ends.
  useEffect(() => {
    setPlaying(playing)
  }, [playing, setPlaying])
  useEffect(() => {
    return () => {
      setPlaying(false)
    }
  }, [setPlaying])

  // Send the next request of a burst once the previous one has finished.
  useEffect(() => {
    if (playing || pending === 0) return
    const timer = window.setTimeout(dispatchNext, reducedMotion ? GAP_MS * 2 : GAP_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [playing, pending, dispatchNext, reducedMotion])

  // Auto traffic keeps one request in flight at a time.
  useEffect(() => {
    if (!autoTraffic || playing || pending > 0) return
    const timer = window.setTimeout(() => queueRequests(1), AUTO_TRAFFIC_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [autoTraffic, playing, pending, queueRequests])

  const step = cursor && trace && trace.requestId === cursor.requestId ? (trace.steps[cursor.index] ?? null) : null
  return {
    step,
    stepKey: cursor ? `${cursor.requestId}-${cursor.index}` : '',
    stepSeconds: cursor ? cursor.ms / 1000 : 0,
    playing,
  }
}
