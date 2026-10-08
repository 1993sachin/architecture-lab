// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { router } from '@/router'
import { isNavActive, primaryNav } from './navigation'

const nav = (label: string) => primaryNav.find((item) => item.label === label)!

describe('navigation', () => {
  it('shows the product first and keeps Notebook and ADRs out of the menu', () => {
    expect(primaryNav.map((item) => item.label)).toEqual(['Incidents', 'Playground', 'About'])
    expect(nav('Incidents').to).toBe('/incident')
  })

  it('keeps Playground highlighted on the sandboxes that live under their old URLs', () => {
    for (const path of ['/playground', '/experiments/resilience', '/experiments/microfrontend', '/simulator']) {
      expect(isNavActive(nav('Playground'), path)).toBe(true)
    }
    expect(isNavActive(nav('Playground'), '/incident')).toBe(false)
    expect(isNavActive(nav('Incidents'), '/incident')).toBe(true)
    expect(isNavActive(nav('About'), '/')).toBe(false)
  })

  it('keeps every existing route, including the hidden ones', () => {
    const paths = router.routes[0]!.children!.map((route) => route.path)
    for (const path of ['playground', 'experiments', 'experiments/microfrontend', 'experiments/resilience', 'simulator', 'incident', 'incidents', 'notebook', 'notebook/:slug', 'adrs', 'about']) {
      expect(paths).toContain(path)
    }
  })
})
