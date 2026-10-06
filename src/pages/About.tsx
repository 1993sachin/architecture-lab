import { site } from '@/lib/site'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { GitHubIcon } from '@/components/ui/GitHubIcon'
import { Card } from '@/components/ui/Card'

const principles = [
  { title: 'Interactive over illustrative', body: 'If a concept can be shown by letting you change it, it is. Static diagrams are a last resort.' },
  { title: 'Trade-offs, not answers', body: 'There is rarely one correct architecture. Every experiment explains what a decision buys and what it costs.' },
  { title: 'Deterministic simulations', body: 'Simulations are plain TypeScript, separate from the UI, so results are reproducible and testable.' },
  { title: 'Static-first', body: 'No accounts, no backend, no tracking. Everything runs in your browser and deploys as a static site.' },
]

const stack = ['React', 'TypeScript', 'Vite', 'React Router', 'Tailwind CSS', 'React Flow', 'Zustand', 'Framer Motion', 'Lucide']

export default function About() {
  useDocumentTitle('About')
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader eyebrow="About" title={`About ${site.name}`} description={site.description} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="principles">
          <h2 id="principles" className="text-sm font-semibold text-fg">
            Principles
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {principles.map((p) => (
              <li key={p.title}>
                <Card className="h-full p-4">
                  <h3 className="text-sm font-semibold text-fg">{p.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{p.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="stack">
            <h2 id="stack" className="text-sm font-semibold text-fg">
              Built with
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {stack.map((s) => (
                <li key={s} className="rounded border border-border bg-surface px-2 py-1 font-mono text-xs text-fg-muted">
                  {s}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="contribute">
            <h2 id="contribute" className="text-sm font-semibold text-fg">
              Open source
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
              New experiments, challenges, articles and ADRs are welcome. Each is defined as local TypeScript data, so most
              contributions don’t touch the UI.
            </p>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-fg hover:text-accent"
            >
              <GitHubIcon className="size-4" /> View on GitHub
            </a>
          </section>
        </aside>
      </div>
    </div>
  )
}
