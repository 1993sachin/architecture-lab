import { lazy } from 'react'
import { createHashRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RouteError } from '@/pages/RouteError'

// Every page is its own chunk; heavy experiments (React Flow) never load on the landing page.
const Home = lazy(() => import('@/pages/Home'))
const Experiments = lazy(() => import('@/pages/Experiments'))
const MicrofrontendPlayground = lazy(() => import('@/pages/MicrofrontendPlayground'))
const ResiliencePlayground = lazy(() => import('@/pages/ResiliencePlayground'))
const ArchitectureSimulator = lazy(() => import('@/pages/ArchitectureSimulator'))
const Notebook = lazy(() => import('@/pages/Notebook'))
const Article = lazy(() => import('@/pages/Article'))
const ADRs = lazy(() => import('@/pages/ADRs'))
const About = lazy(() => import('@/pages/About'))
const NotFound = lazy(() => import('@/pages/NotFound'))

/**
 * Hash routing: GitHub Pages has no server-side rewrites, so deep links like
 * /simulator?scenario=... must not depend on the server finding a file.
 * With hash URLs every shared link hits index.html with a 200 response.
 */
export const router = createHashRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: 'experiments', element: <Experiments /> },
      { path: 'experiments/microfrontend', element: <MicrofrontendPlayground /> },
      { path: 'experiments/resilience', element: <ResiliencePlayground /> },
      { path: 'simulator', element: <ArchitectureSimulator /> },
      { path: 'notebook', element: <Notebook /> },
      { path: 'notebook/:slug', element: <Article /> },
      { path: 'adrs', element: <ADRs /> },
      { path: 'about', element: <About /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
