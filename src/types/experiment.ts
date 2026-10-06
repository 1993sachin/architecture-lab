import type { LucideIcon } from 'lucide-react'

export interface ExperimentMeta {
  id: string
  title: string
  path: string
  summary: string
  /** What the visitor can do in one line, e.g. "Take a microfrontend offline". */
  tryThis: string
  concepts: string[]
  icon: LucideIcon
  status: 'available' | 'coming-soon'
}
