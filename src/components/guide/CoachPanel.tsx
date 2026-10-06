import { useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface CoachPanelProps {
  /** What the coach is reacting to, e.g. "You added a CDN". */
  title: string
  question: string
  explanation: string
  onContinue: () => void
}

/** Coach Mode asks a question about what you just did. It never changes the design for you. */
export function CoachPanel({ title, question, explanation, onContinue }: CoachPanelProps) {
  const [explained, setExplained] = useState(false)
  return (
    <div
      className="rounded-lg border border-accent/40 bg-surface/95 p-3 shadow-md backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <p className="inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider text-accent uppercase">
        <MessageCircleQuestion className="size-3.5" aria-hidden="true" /> Coach · {title}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg">{question}</p>
      {explained && <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">{explanation}</p>}
      <div className="mt-2.5 flex gap-1.5">
        {!explained && (
          <Button size="sm" variant="secondary" className="h-7" onClick={() => setExplained(true)}>
            Explain
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
