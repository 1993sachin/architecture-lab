import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, Siren, X } from 'lucide-react'
import { AnimatePresence, m } from 'framer-motion'
import { site } from '@/lib/site'
import { cn } from '@/lib/cn'
import { GitHubIcon } from '@/components/ui/GitHubIcon'
import { ButtonLink, IconButton } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { LogoMark } from './Logo'
import { isNavActive, primaryNav, startIncident } from './navigation'

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
    isActive ? 'text-fg bg-surface-2' : 'text-fg-muted hover:text-fg',
  )
}

export function TopNav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const onIncident = isNavActive(primaryNav[0], location.pathname)

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <nav aria-label="Primary" className="container-page flex h-14 items-center gap-6">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg">
          <LogoMark className="size-6" />
          {site.name}
        </Link>

        <ul className="hidden items-center gap-0.5 md:flex">
          {primaryNav.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className={navClass({ isActive: isNavActive(item, location.pathname) })} aria-current={isNavActive(item, location.pathname) ? 'page' : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1">
          {!onIncident && (
            // The wrapper hides it on phones: the button's own inline-flex would win over `hidden`.
            <span className="mr-2 hidden sm:block">
              <ButtonLink to={startIncident.to} variant="primary" size="sm">
                <Siren className="size-3.5" aria-hidden="true" />
                {startIncident.label}
              </ButtonLink>
            </span>
          )}
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Architecture Lab on GitHub"
            title="View source on GitHub"
            className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <GitHubIcon className="size-4" />
          </a>
          <ThemeToggle />
          <IconButton
            label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </IconButton>
        </div>
      </nav>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden border-t border-border md:hidden"
          >
            <ul className="container-page flex flex-col gap-0.5 py-2">
              {primaryNav.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(navClass({ isActive: isNavActive(item, location.pathname) }), 'block py-2.5 text-sm')}
                    aria-current={isNavActive(item, location.pathname) ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              {!onIncident && (
                <li className="sm:hidden">
                  <ButtonLink to={startIncident.to} variant="primary" size="md" className="mt-1 w-full">
                    <Siren className="size-4" aria-hidden="true" />
                    {startIncident.label}
                  </ButtonLink>
                </li>
              )}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  )
}
