export interface NavItem {
  label: string
  to: string
}

export const primaryNav: NavItem[] = [
  { label: 'Experiments', to: '/experiments' },
  { label: 'Architecture Simulator', to: '/simulator' },
  { label: 'Incident Runner', to: '/incident' },
  { label: 'Notebook', to: '/notebook' },
  { label: 'ADRs', to: '/adrs' },
  { label: 'About', to: '/about' },
]
