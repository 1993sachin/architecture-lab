import { afterEach } from 'vitest'

// Component tests run in jsdom (opted in per file); logic tests run in node.
if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
  })
  // jsdom has no matchMedia; report a wide screen with motion allowed.
  window.matchMedia ??= ((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
