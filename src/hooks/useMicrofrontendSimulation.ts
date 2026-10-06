import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TICK_MS,
  computeMetrics,
  createInitialState,
  deriveTopology,
  explainState,
  run,
  step,
  type MfeSimState,
} from '@/lib/simulation/microfrontend'
import { useMicrofrontendStore } from '@/store/microfrontendStore'
import { useInterval } from './useInterval'

/** Ticks of history pre-computed so charts aren't empty on first paint. */
const WARMUP_TICKS = 12

function freshState(config: Parameters<typeof step>[1]): MfeSimState {
  return run(createInitialState(), config, WARMUP_TICKS)
}

/** Binds the pure simulation engine to React: ticking, reset and derived views. */
export function useMicrofrontendSimulation() {
  const config = useMicrofrontendStore((s) => s.config)
  const running = useMicrofrontendStore((s) => s.running)
  const runId = useMicrofrontendStore((s) => s.runId)
  const [state, setState] = useState<MfeSimState>(() => freshState(config))

  // A reset (or preset) starts a new deterministic run under the new config.
  useEffect(() => {
    if (runId === 0) return
    setState(freshState(useMicrofrontendStore.getState().config))
  }, [runId])

  const tick = useCallback(() => {
    setState((s) => step(s, useMicrofrontendStore.getState().config))
  }, [])
  useInterval(tick, running ? TICK_MS : null)

  const metrics = useMemo(() => computeMetrics(state), [state])
  const topology = useMemo(() => deriveTopology(config, metrics), [config, metrics])
  const explanation = useMemo(() => explainState(config, metrics), [config, metrics])

  return { state, config, metrics, topology, explanation, running }
}
