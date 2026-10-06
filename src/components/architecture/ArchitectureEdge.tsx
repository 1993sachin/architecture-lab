import { memo } from 'react'
import { BaseEdge, getBezierPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion'
import type { ArchitectureEdgeType } from './types'

const stroke = {
  ok: 'var(--border-strong)',
  degraded: 'var(--degraded)',
  failed: 'var(--failed)',
  idle: 'var(--border)',
} as const

/**
 * Connection between two components. Healthy edges carry animated request
 * dots whose speed reflects latency; failing edges turn into a red dashed
 * line with a break marker.
 */
export const ArchitectureEdge = memo(function ArchitectureEdge(props: EdgeProps<ArchitectureEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const reducedMotion = usePrefersReducedMotion()
  const geometry = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }
  const [path, labelX, labelY] =
    data?.path === 'step' ? getSmoothStepPath({ ...geometry, borderRadius: 10, offset: 24 }) : getBezierPath(geometry)
  const flow = data?.flow ?? 'ok'
  const duration = data?.duration ?? 1.4
  const showDots = !reducedMotion && (flow === 'ok' || flow === 'degraded')

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: stroke[flow],
          strokeWidth: flow === 'idle' ? 1.25 : 1.75,
          strokeDasharray: flow === 'failed' || flow === 'idle' ? '5 5' : undefined,
          transition: 'stroke 300ms',
        }}
        className={flow === 'failed' && !reducedMotion ? 'animate-flow' : undefined}
      />
      {showDots &&
        [0, 0.5].map((offset) => (
          <circle key={offset} r={flow === 'degraded' ? 2.5 : 3} fill={flow === 'degraded' ? 'var(--degraded)' : 'var(--accent)'}>
            <animateMotion dur={`${duration}s`} repeatCount="indefinite" path={path} begin={`-${offset * duration}s`} />
          </circle>
        ))}
      {flow === 'failed' && (
        <g transform={`translate(${labelX} ${labelY})`} aria-hidden="true">
          <circle r={9} fill="var(--surface)" stroke="var(--failed)" strokeWidth={1.5} />
          <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" stroke="var(--failed)" strokeWidth={1.75} strokeLinecap="round" />
        </g>
      )}
    </>
  )
})
