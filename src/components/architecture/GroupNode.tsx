import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { cn } from '@/lib/cn'
import type { GroupNodeType } from './types'

/** Dashed boundary that marks a deployment unit, such as a monolith bundle. */
export const GroupNode = memo(function GroupNode({ data, width, height }: NodeProps<GroupNodeType>) {
  return (
    <div
      style={{ width, height }}
      className={cn(
        'pointer-events-none rounded-xl border-2 border-dashed transition-colors duration-300',
        data.tone === 'failed' ? 'border-failed/50 bg-failed/[0.04]' : 'border-border-strong bg-surface-2/30',
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className={cn('font-mono text-[11px] font-medium', data.tone === 'failed' ? 'text-failed' : 'text-fg-muted')}>{data.label}</span>
        {data.sublabel && <span className="font-mono text-[10px] text-fg-subtle">{data.sublabel}</span>}
      </div>
    </div>
  )
})
