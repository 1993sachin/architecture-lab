# Architecture Lab

**Build it. Break it. Measure it. Understand it.**

An interactive playground for exploring software architecture, system design, performance, and resilience. Instead of reading static diagrams, you change architectural decisions, inject failures, and watch a simulated system react.

> Work in progress. Phase 1 (foundation: design system, layout, routing, landing page) is in place. Experiments, the Architecture Decision Simulator, the Notebook and ADRs land in the following phases.

## Tech stack

React · TypeScript · Vite · React Router · Tailwind CSS · React Flow · Zustand · Framer Motion · Lucide

## Local development

Requires Node.js 22.12+ or 24+ (Node 24 LTS recommended; `.nvmrc` pins it, so `nvm use` picks it up). Node 23 and 25 are not supported by Vitest.

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck and build to dist/
npm run preview    # serve the production build
npm test           # run unit tests (Vitest)
```

## Project structure

```
src/
  components/
    layout/      App shell, top navigation, footer
    ui/          Design-system primitives (Button, Card, Badge, Switch, Slider, ...)
    home/        Landing page sections
  data/          Experiment registry and (later) challenges, articles, ADRs
  hooks/         Shared React hooks
  lib/           Framework-free helpers
  pages/         One lazily loaded component per route
  store/         Zustand stores
  types/         Shared types
  router.tsx     Route table
```

## Routing and deployment

The app uses hash routing (`/#/simulator?...`) so it runs on GitHub Pages and other static hosts without server rewrites, and shared links always resolve. The Vite `base` is relative (`./`), so the same build works under `/architecture-lab/` or a custom domain.
