import { Link } from 'react-router-dom'
import { site } from '@/lib/site'
import { GitHubIcon } from '@/components/ui/GitHubIcon'
import { LogoMark } from './Logo'
import { primaryNav } from './navigation'

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="container-page flex flex-col gap-6 py-10 text-[13px] text-fg-subtle sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <div className="flex items-center gap-2 font-semibold text-fg">
            <LogoMark className="size-5" />
            {site.name}
          </div>
          <p className="mt-2 leading-relaxed">{site.tagline}</p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-2 sm:grid-cols-3">
            {primaryNav.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="transition-colors hover:text-fg">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={site.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-fg">
                <GitHubIcon className="size-3.5" /> Source
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="container-page border-t border-border py-4 font-mono text-[11px] text-fg-subtle">
        Static-first · No tracking · Simulations run entirely in your browser
      </div>
    </footer>
  )
}
