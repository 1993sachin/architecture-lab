import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PageLoader } from '@/components/ui/Spinner'
import { TopNav } from './TopNav'
import { Footer } from './Footer'

function ScrollToTop() {
  const { pathname } = useLocation()
  // Block body on purpose: browser extensions sometimes patch scrollTo to
  // return a value, and React would then call that value as a cleanup.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <TopNav />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
