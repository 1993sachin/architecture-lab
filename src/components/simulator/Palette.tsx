import { ChevronRight, GripVertical } from 'lucide-react'
import { CATEGORIES, CATEGORY_LABELS, COMPONENTS, type ComponentType } from '@/lib/architecture'
import { kindIcons } from '@/components/architecture/kindIcons'
import { DRAG_MIME, KIND_OF } from './componentKinds'

/**
 * Components grouped by category. Drag one onto the canvas, or press it to
 * drop it in the middle of the view (keyboard and touch friendly).
 */
export function Palette({ onAdd }: { onAdd: (type: ComponentType) => void }) {
  return (
    <nav aria-label="Components" className="space-y-1">
      {CATEGORIES.map((cat) => (
        <details key={cat} open={cat !== 'observability'} className="group/cat">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-1 py-1.5 font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase select-none hover:text-fg-muted [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3 transition-transform group-open/cat:rotate-90" aria-hidden="true" />
            {CATEGORY_LABELS[cat]}
          </summary>
          <ul className="mb-2 space-y-0.5">
            {COMPONENTS.filter((c) => c.category === cat).map((c) => {
              const Icon = kindIcons[KIND_OF[c.type]]
              return (
                <li key={c.type}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, c.type)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => onAdd(c.type)}
                    title={`${c.description}. Drag onto the canvas, or click to add.`}
                    aria-label={`Add ${c.label}`}
                    data-guide-target={`palette-${c.type}`}
                    className="group flex w-full cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-[13px] text-fg-muted transition-colors hover:border-border hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
                  >
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-border bg-surface-2 text-fg-muted group-hover:text-fg">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <GripVertical
                      className="size-3.5 shrink-0 text-fg-subtle opacity-0 group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </details>
      ))}
    </nav>
  )
}
