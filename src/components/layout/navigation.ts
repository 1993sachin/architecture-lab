export interface NavItem {
  label: string
  to: string
  /** Other path prefixes that belong to this section, so it stays highlighted there too. */
  also?: string[]
}

/**
 * Incidents is the product; the Playground holds the concept sandboxes.
 * Notebook and ADRs keep their routes but stay out of the navigation until
 * they have content.
 */
export const primaryNav: NavItem[] = [
  // One scenario for now, so this opens its briefing. A scenario list can take over /incidents later.
  { label: 'Incidents', to: '/incident', also: ['/incidents'] },
  { label: 'Playground', to: '/playground', also: ['/experiments', '/simulator'] },
  { label: 'About', to: '/about' },
]

/** The one primary action, offered in the header everywhere except the incident itself. */
export const startIncident = { label: 'Start an incident', to: '/incident' } as const

export function isNavActive(item: NavItem, pathname: string): boolean {
  return [item.to, ...(item.also ?? [])].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
