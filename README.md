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
    incident/    Incident Runner screens and postmortem
  data/          Experiment registry and (later) challenges, articles, ADRs
  hooks/         Shared React hooks
  lib/           Framework-free helpers
  pages/         One lazily loaded component per route
  store/         Zustand stores
  types/         Shared types
  router.tsx     Route table
```

## Incident Runner

`/#/incident` plays the **10× Traffic Incident** as a sequence of decisions: briefing, page, observe, decide, watch the system move, repeat, then a postmortem. Every number on the screen comes from [`@architecture-lab/engine`](https://github.com/1993sachin/architecture-lab-engine), which is installed from GitHub pinned to a commit (its `prepare` script builds it on install).

```
React components (src/components/incident, src/pages/IncidentRunner.tsx)
  ↓ render view models, dispatch moves
Zustand store (src/store/incidentStore.ts)
  ↓
Incident Runner adapter (src/lib/incident/session.ts, review.ts)
  ↓ drives the simulation, builds view models, never reveals hidden observations
Architecture Lab Engine → scenario
```

- **Pacing.** A change to the system takes one simulated minute (`DECISION_MINUTES`); an investigation takes the time the scenario gives it. Waiting stops early when an event fires or a constraint changes. All of it is recorded as engine actions.
- **Hidden information.** A tile, diagram load or fact appears only once the engine reports it observable; until then the UI says which investigation would reveal it.
- **Postmortem.** Rendered from the engine's structured postmortem. Trade-offs come from replaying the scenario's reference playbooks; "Compare with another decision" replays your run with one decision swapped. No model writes or judges anything.
- **Replay.** "Replay decisions" pushes your moves through a fresh simulation, one by one, and checks the result is identical.

To work on the engine and the app together, `npm link` the engine checkout, or point the dependency at a newer commit.

## Routing and deployment

The app uses hash routing (`/#/simulator?...`) so it runs on GitHub Pages and other static hosts without server rewrites, and shared links always resolve. The Vite `base` is relative (`./`), so the same build works under `/architecture-lab/` or a custom domain.
