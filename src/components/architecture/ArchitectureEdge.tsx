import { memo } from 'react'
import { BaseEdge, getBezierPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion'
import type { ArchitectureEdgeType, PulseKind } from './types'
import type { FlowState } from '@/types/status'

const stroke: Record<FlowState, string> = {
  ok: 'var(--border-strong)',
  degraded: 'var(--degraded)',
  failed: 'var(--failed)',
  idle: 'var(--border)',
  retry: 'var(--warning)',
  queued: 'var(--info)',
}

const dash: Partial<Record<FlowState, string>> = {
  failed: '5 5',
  idle: '5 5',
  retry: '6 3',
  queued: '2 4',
}

const pulseColor: Record<PulseKind, string> = {
  request: 'var(--accent)',
  response: 'var(--healthy)',
  retry: 'var(--warning)',
  failed: 'var(--failed)',
  queued: 'var(--info)',
  cache: 'var(--info)',
}

/**
 * Connection between two components. Healthy edges carry ambient request
 * dots whose speed reflects latency; failing edges turn into a red dashed
 * line with a break marker. A `pulse` draws one request travelling the edge.
 */
export const ArchitectureEdge = memo(function ArchitectureEdge(props: EdgeProps<ArchitectureEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const reducedMotion = usePrefersReducedMotion()
  const geometry = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }
  const [path, labelX, labelY] =
    data?.path === 'step' ? getSmoothStepPath({ ...geometry, borderRadius: 10, offset: 24 }) : getBezierPath(geometry)
  const flow = data?.flow ?? 'ok'
  const duration = data?.duration ?? 1.4
  const showAmbient = (data?.ambient ?? true) && !reducedMotion && (flow === 'ok' || flow === 'degraded')
  const pulse = data?.pulse
  const animatedDash = !reducedMotion && (flow === 'failed' || flow === 'retry' || flow === 'queued')

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: pulse ? pulseColor[pulse.kind] : stroke[flow],
          strokeWidth: pulse ? 2.25 : flow === 'idle' ? 1.25 : 1.75,
          strokeDasharray: dash[flow],
          transition: 'stroke 200ms, stroke-width 200ms',
        }}
        className={animatedDash ? 'animate-flow' : undefined}
      />
      {showAmbient &&
        [0, 0.5].map((offset) => (
          <circle key={offset} r={flow === 'degraded' ? 2.5 : 3} fill={flow === 'degraded' ? 'var(--degraded)' : 'var(--accent)'}>
            <animateMotion dur={`${duration}s`} repeatCount="indefinite" path={path} begin={`-${offset * duration}s`} />
          </circle>
        ))}
      {pulse && !reducedMotion && (
        <circle key={pulse.key} r={4.5} fill={pulseColor[pulse.kind]} stroke="var(--surface)" strokeWidth={1.5}>
          <animateMotion
            dur={`${pulse.duration}s`}
            repeatCount="1"
            fill="freeze"
            path={path}
            keyPoints={pulse.reverse ? '1;0' : '0;1'}
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      )}
      {flow === 'failed' && (
        <g transform={`translate(${labelX} ${labelY})`} aria-hidden="true">
          <circle r={9} fill="var(--surface)" stroke="var(--failed)" strokeWidth={1.5} />
          <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" stroke="var(--failed)" strokeWidth={1.75} strokeLinecap="round" />
        </g>
      )}
    </>
  )
})
