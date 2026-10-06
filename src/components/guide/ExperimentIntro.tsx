/** The scenario question and why it matters, shown at the start of a guide. */
export function ExperimentIntro({ scenario, introduction }: { scenario: string; introduction: string }) {
  return (
    <div className="border-l-2 border-accent pl-3">
      <p className="text-[15px] font-semibold text-fg">{scenario}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{introduction}</p>
    </div>
  )
}
