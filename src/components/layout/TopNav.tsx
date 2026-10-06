import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { AnimatePresence, m } from 'framer-motion'
import { site } from '@/lib/site'
import { cn } from '@/lib/cn'
import { GitHubIcon } from '@/components/ui/GitHubIcon'
import { IconButton } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { LogoMark } from './Logo'
import { primaryNav } from './navigation'

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
    isActive ? 'text-fg bg-surface-2' : 'text-fg-muted hover:text-fg',
  )
}

export function TopNav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

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
              <NavLink to={item.to} className={navClass}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1">
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
                  <NavLink to={item.to} className={({ isActive }) => cn(navClass({ isActive }), 'block py-2.5 text-sm')}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  )
}
