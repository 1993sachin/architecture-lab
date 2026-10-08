// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LazyMotion, domAnimation } from 'framer-motion'
import IncidentRunner from './IncidentRunner'
import { useIncidentStore } from '@/store/incidentStore'

function setup() {
  const user = userEvent.setup()
  render(
    <LazyMotion features={domAnimation}>
      <IncidentRunner />
    </LazyMotion>,
  )
  return user
}

type User = ReturnType<typeof userEvent.setup>

async function takeIncident(user: User) {
  await user.click(screen.getByRole('button', { name: 'Start the incident' }))
  await user.click(screen.getByRole('button', { name: 'Acknowledge and take the incident' }))
}

function actionButton(title: string) {
  return within(screen.getByRole('region', { name: 'Available actions' })).getByRole('button', { name: new RegExp(title) })
}

async function decide(user: User, title: string, rationale: string) {
  await user.click(actionButton(title))
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText('Why are you doing this?'), rationale)
  await user.click(within(dialog).getByRole('button', { name: /Commit decision|^Investigate$/ }))
}

const clock = () => screen.getByTestId('clock').textContent

beforeEach(() => {
  useIncidentStore.getState().runAgain()
  useIncidentStore.setState({ mode: 'guided' })
})

describe('Incident Runner', () => {
  it('opens on a briefing that sets up the role, then pages the operator', async () => {
    const user = setup()
    expect(screen.getByRole('heading', { level: 1, name: 'You’re on call.' })).toBeTruthy()
    expect(screen.getByText('You cannot see everything')).toBeTruthy()
    expect(screen.getByText('There is no single right answer')).toBeTruthy()
    // What success is measured against, before anything starts.
    const objectives = within(screen.getByRole('list', { name: 'Objectives' })).getAllByRole('listitem')
    expect(objectives).toHaveLength(useIncidentStore.getState().session.scenario.objectives.length)
    expect(screen.getByText('Keep users served')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Limits' })).getByText('budget ≤ $3,500/mo')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Start the incident' }))
    const page = screen.getByRole('dialog', { name: 'You have been paged' })
    expect(within(page).getByText(/SLO breached/)).toBeTruthy()
    expect(within(page).getByText(/Launch goes viral/)).toBeTruthy()
    await user.click(within(page).getByRole('button', { name: 'Acknowledge and take the incident' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // The jump from the briefing to the page reads as the shift starting, not as a choice to wait.
    expect(screen.getByTestId('transition').textContent).toMatch(/3 minutes into your shift, you got paged\./)
    expect(screen.getByTestId('transition').textContent).not.toMatch(/You held and watched/)
  })

  it('shows the initial incident state: clock, status, budget and impact', async () => {
    const user = setup()
    await takeIncident(user)
    expect(clock()).toBe('T+03')
    expect(screen.getByTestId('incident-status').textContent).toMatch(/ACTIVE/)
    expect(screen.getByTestId('budget').textContent).toMatch(/\$1,862 \/ \$3,500/)
    expect(screen.getByTestId('slo-status').textContent).toMatch(/SLO BREACHED/)
    expect(screen.getByTestId('metric-traffic').textContent).toMatch(/15K rps/)
  })

  it('hides what the operator cannot observe yet', async () => {
    const user = setup()
    await takeIncident(user)
    // The database's load is not among the things you know, and nothing on screen gives it away.
    expect(screen.queryByTestId('metric-dbCpu')).toBeNull()
    expect(screen.getByTestId('node-db').textContent).toMatch(/load unknown/)
    const unknowns = screen.getByRole('list', { name: 'Unknowns' })
    expect(within(unknowns).getByText(/PostgreSQL CPU/)).toBeTruthy()
    expect(within(unknowns).getByRole('button', { name: /Investigate the database/ })).toBeTruthy()
    expect(screen.getByTestId('situation').textContent).toMatch(/Database load is unknown/)
    expect(screen.getByTestId('cause-database').textContent).toMatch(/You don’t know yet/)
    expect(document.body.textContent).not.toMatch(/PostgreSQL CPU is \d/)
  })

  it('investigation is a decision: it takes time while the incident continues, and reveals new information', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(actionButton('Investigate the database'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('This takes about 2 minutes.')).toBeTruthy()
    expect(within(dialog).getByText('The incident continues while you investigate.')).toBeTruthy()
    expect(within(dialog).getByText(/may change which intervention makes sense/)).toBeTruthy()
    await user.type(within(dialog).getByLabelText('Why are you doing this?'), 'Is the database the bottleneck?')
    await user.click(within(dialog).getByRole('button', { name: 'Investigate' }))
    expect(clock()).toBe('T+05')
    const reveal = screen.getByTestId('new-information')
    expect(reveal.textContent).toMatch(/previously unavailable/i)
    expect(reveal.textContent).toMatch(/PostgreSQL CPU/)
    expect(screen.getByTestId('metric-dbCpu').textContent).toMatch(/%/)
    expect(screen.getByTestId('budget').textContent).toMatch(/\$1,862/)
    // What was unknown is now evidence, and the card says how the picture changed.
    expect(screen.getByTestId('cause-database').textContent).toMatch(/Evidence suggests/)
    expect(screen.getByTestId('picture-changed').textContent).toMatch(/Database saturation: unknown → evidence suggests/)
    // Investigating teaches what the number means, not just the number, rounded like the rest of the screen.
    expect(reveal.textContent).toMatch(/plausible contributor/)
    expect(reveal.textContent).toMatch(/PostgreSQL CPU: \d+%/)
    expect(document.body.textContent).not.toMatch(/\d+\.\d\d%/)
  })

  it('explains a metric in plain English when it is clicked, using the live value', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(screen.getByRole('button', { name: 'Explain p99 latency' }))
    const p99 = screen.getByTestId('explain-p99')
    expect(p99.textContent).toMatch(/99% of requests complete|fastest 99% finish/)
    expect(p99.textContent).toMatch(/99 out of 100 requests finish within \d+ ms/)
    expect(p99.textContent).toMatch(/Why does it matter\?/)
    expect(p99.textContent).toMatch(/Why might this be bad\?/)
    // Hedged: a possibility from what is visible, never a verdict about a hidden component.
    expect(p99.textContent).toMatch(/Possibilities, not a diagnosis/)
    expect(p99.textContent).not.toMatch(/PostgreSQL CPU is \d/)
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('explain-p99')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Explain Availability' }))
    const availability = screen.getByTestId('explain-availability')
    expect(availability.textContent).toMatch(/out of 100 requests succeed/)
    expect(availability.textContent).toMatch(/no universal “increase availability” button/)
    await user.click(within(availability).getByText(/Learn more/))
    expect(availability.textContent).toMatch(/Caching expensive reads/)
  })

  it('explains throttling as a protection with a trade-off', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(screen.getByRole('button', { name: 'Explain Throttled' }))
    const throttled = screen.getByTestId('explain-throttled')
    expect(throttled.textContent).toMatch(/Nothing is being turned away/)
    expect(throttled.textContent).toMatch(/protection with a business cost, not a fix/)
    await user.click(within(throttled).getByText(/Learn more/))
    for (const title of ['Without protection', 'With throttling', 'More throttling', 'Less throttling']) expect(within(throttled).getByText(title)).toBeTruthy()
  })

  it('lets the operator state a hypothesis, and shows it against the evidence afterwards', async () => {
    const user = setup()
    await takeIncident(user)
    const move = screen.getByTestId('your-move')
    await user.click(within(move).getByRole('radio', { name: 'Database pressure' }))
    expect(within(move).getByRole('radio', { name: 'Database pressure' }).getAttribute('aria-checked')).toBe('true')
    await user.click(actionButton('Investigate the database'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Your hypothesis: database pressure/)).toBeTruthy()
    expect((within(dialog).getByLabelText('Why are you doing this?') as HTMLTextAreaElement).value).toMatch(/^I think the cause is database pressure, because /)
    await user.type(within(dialog).getByLabelText('Why are you doing this?'), 'errors with an idle app')
    await user.click(within(dialog).getByRole('button', { name: 'Investigate' }))
    const check = screen.getByTestId('hypothesis-check')
    expect(check.textContent).toMatch(/You thought: database pressure/)
    expect(check.textContent).toMatch(/Now: evidence suggests/)
    // The prompt resets for the next decision.
    expect(within(screen.getByTestId('your-move')).queryByRole('radio', { checked: true })).toBeNull()
  })

  it('confirms a decision with its cost, complexity, effect and risks', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(actionButton('Add a Redis cache'))
    const dialog = screen.getByRole('dialog')
    // What you are about to do, what it is for, and which way it should push things.
    expect(within(dialog).getByText(/You are about to/)).toBeTruthy()
    expect(within(dialog).getByText('You are trying to')).toBeTruthy()
    expect(within(dialog).getByText(/Reduce database pressure by serving cacheable reads/)).toBeTruthy()
    expect(within(dialog).getByText('Expected direction')).toBeTruthy()
    expect(within(dialog).getByText(/Latency/).textContent).toMatch(/if database pressure is contributing/)
    expect(within(dialog).getByText('What happens')).toBeTruthy()
    expect(within(dialog).getByText(/Serve reads from Redis/)).toBeTruthy()
    expect(within(dialog).getByText('+$256/mo')).toBeTruthy()
    expect(within(dialog).getByText('+3')).toBeTruthy()
    expect(within(dialog).getByText('Potential risks and trade-offs')).toBeTruthy()
    expect(within(dialog).getByText(/data up to a minute old/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(clock()).toBe('T+03')
  })

  it('will not commit a decision without a rationale', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(actionButton('Add a Redis cache'))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Commit decision' }))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/reasoning/)
    expect(clock()).toBe('T+03')
    expect(useIncidentStore.getState().session.simulation().getHistory().decisions).toHaveLength(0)
    await user.type(within(dialog).getByLabelText('Why are you doing this?'), 'Reads dominate')
    await user.click(within(dialog).getByRole('button', { name: 'Commit decision' }))
    expect(useIncidentStore.getState().session.simulation().getHistory().decisions[0]?.rationale).toBe('Reads dominate')
  })

  it('advances time after a decision and shows what changed', async () => {
    const user = setup()
    await takeIncident(user)
    await decide(user, 'Add a Redis cache', 'Reads dominate')
    expect(clock()).toBe('T+04')
    const transition = screen.getByTestId('transition')
    expect(transition.textContent).toMatch(/You chose: Add a Redis cache/)
    expect(screen.getByTestId('transition-clock').textContent).toBe('T+03T+04')
    expect(within(transition).getByRole('group', { name: 'Changes' }).textContent).toMatch(/Monthly cost/)
    expect(within(transition).getByTestId('trying-to').textContent).toMatch(/reduce database pressure/)
    expect(within(transition).getByTestId('why-this-happened').textContent).toMatch(/served from cache instead of reaching PostgreSQL: Redis answers \d+% of reads/)
    expect(within(transition).getByTestId('new-risk').textContent).toMatch(/Cache warm-up and invalidation/)
    expect(screen.getByTestId('node-cache').textContent).toMatch(/new/)
    await user.click(screen.getByRole('button', { name: 'Wait 1 min' }))
    expect(clock()).toBe('T+05')
    expect(screen.getByTestId('transition').textContent).toMatch(/You held and watched/)
  })

  it('surfaces a changing constraint as a prominent alert', async () => {
    const user = setup()
    await takeIncident(user)
    await decide(user, 'Add a read replica', 'Take reads off the primary')
    await decide(user, 'Upgrade the PostgreSQL instance', 'More headroom')
    while (!screen.queryByRole('dialog', { name: /New constraint/ })) await user.click(screen.getByRole('button', { name: 'Wait 5 min' }))
    const alert = screen.getByRole('dialog', { name: /New constraint/ })
    expect(clock()).toBe('T+25')
    expect(within(alert).getByText('Finance lowers the budget')).toBeTruthy()
    expect(alert.textContent).toMatch(/\$3,500\/mo.*\$2,800\/mo/)
    expect(alert.textContent).toMatch(/Current cost/)
    expect(alert.textContent).toMatch(/Headroom/)
    await user.click(within(alert).getByRole('button', { name: 'Understood' }))
    expect(screen.getByTestId('budget').textContent).toMatch(/\$2,800/)
  })

  it('shows blocked decisions with the reason and refuses ones the engine rejects', async () => {
    const user = setup()
    await takeIncident(user)
    await decide(user, 'Add a Redis cache', 'a')
    await decide(user, 'Add a read replica', 'b')
    const queue = actionButton('Queue writes asynchronously') as HTMLButtonElement
    expect(queue.disabled).toBe(true)
    expect(queue.textContent).toMatch(/Unavailable: Complexity limit/)
    // A decision the engine refuses (the cache already exists) is reported, and time does not move.
    const before = clock()
    act(() => useIncidentStore.setState({ pending: { ...useIncidentStore.getState().view.actions[0]!, id: 'enable-cache', kind: 'change' } }))
    await user.type(await screen.findByLabelText('Why are you doing this?'), 'again')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Commit decision/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Decision refused.*already been taken/)
    expect(clock()).toBe(before)
  })

  it('completes the incident and renders the postmortem', async () => {
    const user = setup()
    await takeIncident(user)
    await decide(user, 'Investigate the database', 'Is it the database?')
    await decide(user, 'Add a Redis cache', 'Reads dominate')
    await user.click(screen.getByRole('button', { name: /Play out to the end/ }))
    expect(clock()).toBe('T+45')
    expect(screen.getByTestId('incident-status').textContent).toMatch(/CLOSED/)
    await user.click(screen.getAllByRole('button', { name: 'Read the postmortem' })[0]!)
    expect(screen.getByTestId('outcome').textContent).toMatch(/STABILIZED|PARTIAL SUCCESS|NOT CONTAINED|OBJECTIVES MISSED/)
    expect(screen.getByRole('region', { name: 'Impact' }).textContent).toMatch(/Failed requests/)
    expect(screen.getByRole('region', { name: 'Cost' }).textContent).toMatch(/Spent during incident/)
    const decisions = screen.getByRole('list', { name: 'Decision timeline' })
    expect(within(decisions).getByText('“Reads dominate”')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'What worked' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'What hurt' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Trade-offs' }).textContent).toMatch(/Cache first/)
    expect(screen.getByRole('region', { name: /Architecture at T\+45/ }).textContent).toMatch(/Redis/)
  })

  it('compares the run with a swapped decision using engine replay', async () => {
    const user = setup()
    await takeIncident(user)
    await decide(user, 'Add a Redis cache', 'Reads dominate')
    await user.click(screen.getByRole('button', { name: /Play out to the end/ }))
    await user.click(screen.getAllByRole('button', { name: 'Read the postmortem' })[0]!)
    await user.selectOptions(screen.getByLabelText('I would have'), 'scale-application')
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    expect(screen.getByTestId('counterfactual').textContent).toMatch(/Instead: Scale the application/)
  })

  it('replays the decisions and reaches the identical result; run again resets', async () => {
    const user = setup()
    await takeIncident(user)
    await decide(user, 'Investigate the traffic', 'What is the traffic?')
    await decide(user, 'Add a Redis cache', 'Reads dominate')
    await user.click(screen.getByRole('button', { name: 'Wait 5 min' }))
    await user.click(screen.getByRole('button', { name: /Play out to the end/ }))
    await user.click(screen.getAllByRole('button', { name: 'Read the postmortem' })[0]!)
    await user.click(screen.getByRole('button', { name: 'Replay decisions' }))
    expect(screen.getByTestId('replay-bar').textContent).toMatch(/move 0 of 5/)
    await user.click(screen.getByRole('button', { name: 'Next move' }))
    expect(clock()).toBe('T+03')
    await user.click(screen.getByRole('button', { name: 'Replay the rest' }))
    expect(screen.getByTestId('replay-verdict').textContent).toMatch(/Identical result/)
    await user.click(screen.getByRole('button', { name: 'Back to the postmortem' }))
    await user.click(screen.getByRole('button', { name: 'Run again' }))
    expect(screen.getByRole('button', { name: 'Start the incident' })).toBeTruthy()
  })

  it('produces the same engine result for the same sequence of UI decisions', async () => {
    const results: string[] = []
    for (let run = 0; run < 2; run++) {
      useIncidentStore.getState().runAgain()
      const user = setup()
      await takeIncident(user)
      await decide(user, 'Investigate the database', 'Look first')
      await decide(user, 'Add a Redis cache', 'Reads dominate')
      await decide(user, 'Scale the application', 'CPU is high')
      await user.click(screen.getByRole('button', { name: 'Wait 5 min' }))
      await user.click(screen.getByRole('button', { name: /Play out to the end/ }))
      results.push(JSON.stringify(useIncidentStore.getState().session.simulation().getResult()))
      document.body.innerHTML = ''
    }
    expect(results[0]).toBe(results[1])
  })
})

describe('Guided success', () => {
  const guidance = () => screen.getByTestId('guidance')

  it('walks through "Help me reason": what hurts, what we know, what we are missing, then a next step', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(within(guidance()).getByRole('button', { name: /Help me reason/ }))
    const flow = screen.getByTestId('reasoning-flow')
    expect(within(flow).getByText('What is currently hurting?')).toBeTruthy()
    await user.click(within(flow).getByRole('radio', { name: /Latency/ }))
    expect(screen.getByTestId('flow-symptom').textContent).toMatch(/p99 latency is 775 ms; the SLO is at most 500 ms. It is breaching/)
    expect(within(flow).getByText(/PostgreSQL CPU/).textContent).toMatch(/Unknown/i)
    await user.click(within(flow).getByRole('radio', { name: 'Database utilization' }))
    expect(screen.getByTestId('flow-missing').textContent).toMatch(/You don’t know how busy PostgreSQL is/)
    await user.click(within(flow).getByRole('button', { name: /Investigate the database/ }))
    // It opens the usual preview; nothing is decided for the operator.
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Investigate the database' })).toBeTruthy()
    expect(clock()).toBe('T+03')
  })

  it('climbs the ladder on request: hint, stronger hint, guided reasoning, without acting', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(within(guidance()).getByRole('button', { name: 'Give me a hint' }))
    let hint = screen.getByTestId('hint')
    expect(hint.textContent).toMatch(/^.*Hint/)
    expect(hint.textContent).toMatch(/which downstream component might be limiting throughput\?/)
    expect(hint.textContent).not.toMatch(/PostgreSQL/)
    await user.click(within(hint).getByRole('button', { name: 'Stronger hint' }))
    hint = screen.getByTestId('hint')
    expect(hint.textContent).toMatch(/We don’t currently know how much database capacity is being consumed/)
    expect(within(hint).getByRole('button', { name: /Investigate the database/ })).toBeTruthy()
    await user.click(within(hint).getByRole('button', { name: 'Walk me through it' }))
    hint = screen.getByTestId('hint')
    expect(within(hint).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4)
    expect(hint.textContent).toMatch(/A reasonable next step is to investigate the database/)
    expect(hint.textContent).toMatch(/You decide/)
    expect(clock()).toBe('T+03')
    expect(useIncidentStore.getState().guidance.used).toMatchObject({ hints: 1, strongHints: 1, rescues: 1 })
  })

  it('points out an unmeasured database before a capacity change, and lets the operator switch or carry on', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(actionButton('^Scale the application(?! down)'))
    const nudge = screen.getByTestId('investigate-first')
    expect(nudge.textContent).toMatch(/You don’t yet have enough evidence to determine whether PostgreSQL is saturated/)
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Commit decision' })).toBeTruthy()
    await user.click(within(nudge).getByRole('button', { name: /Investigate the database instead/ }))
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Investigate the database' })).toBeTruthy()
  })

  it('after a move, shows how it did against the stated objective and the new clue it reveals', async () => {
    const user = setup()
    await takeIncident(user)
    await decide(user, 'Investigate the database', 'Is it the database?')
    await user.click(actionButton('^Scale the application(?! down)'))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: 'Increase capacity' }))
    await user.type(within(dialog).getByLabelText('Why are you doing this?'), 'More app capacity')
    await user.click(within(dialog).getByRole('button', { name: 'Commit decision' }))
    expect(screen.getByTestId('objective-result').textContent).toMatch(/You wanted to: increase capacity/)
    expect(screen.getByTestId('new-clue').textContent).toMatch(/bottleneck appears to have shifted downstream/)
    expect(screen.getByTestId('new-clue').textContent).toMatch(/\?$/)
  })

  it('offers a hint, quietly, when things keep getting worse, and can be dismissed', async () => {
    const user = setup()
    await takeIncident(user)
    expect(screen.queryByTestId('struggle-prompt')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Wait 1 min' }))
    await user.click(screen.getByRole('button', { name: 'Wait 1 min' }))
    const prompt = screen.getByTestId('struggle-prompt')
    expect(prompt.textContent).toMatch(/Want a hint\?/)
    await user.click(within(prompt).getByRole('button', { name: 'Not now' }))
    expect(screen.queryByTestId('struggle-prompt')).toBeNull()
  })

  it('Challenge mode keeps explanations on request but gives no proactive help', async () => {
    const user = setup()
    await user.click(screen.getByRole('radio', { name: /Challenge/ }))
    await takeIncident(user)
    for (const id of ['guidance', 'your-move', 'situation', 'struggle-prompt']) expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.queryByRole('region', { name: /What might be causing it/ })).toBeNull()
    // What an action is for stays one click away instead of shown up front.
    expect(screen.queryByText('Increase application processing capacity.')).toBeNull()
    expect(screen.getAllByRole('button', { name: /What it’s for/ }).length).toBeGreaterThan(0)
    // Concepts still explain themselves when asked.
    await user.click(screen.getByRole('button', { name: /Explain p99/ }))
    expect(screen.getByTestId('explain-p99')).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Wait 1 min' }))
    await user.click(screen.getByRole('button', { name: 'Wait 1 min' }))
    expect(screen.queryByTestId('struggle-prompt')).toBeNull()
  })

  it('Expert mode shows raw state with no engineering interpretation', async () => {
    const user = setup()
    await user.click(screen.getByRole('radio', { name: /Expert/ }))
    await takeIncident(user)
    for (const id of ['guidance', 'your-move', 'situation']) expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.queryByText('What you don’t know')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Unknowns' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Explain p99/ })).toBeNull()
    expect(screen.queryByText('Investigations reduce uncertainty. Actions change the system.')).toBeNull()
    // Raw numbers are still there.
    expect(screen.getByTestId('metric-traffic').textContent).toMatch(/15K rps/)
    await decide(user, 'Investigate the database', 'check it')
    expect(screen.getByTestId('new-information').textContent).toMatch(/PostgreSQL CPU: \d+%/)
    expect(screen.getByTestId('new-information').textContent).not.toMatch(/plausible contributor/)
    expect(screen.queryByTestId('why-this-happened')).toBeNull()
    expect(screen.queryByTestId('trying-to')).toBeNull()
    await user.click(actionButton('^Scale the application(?! down)'))
    expect(screen.queryByTestId('investigate-first')).toBeNull()
    expect(within(screen.getByRole('dialog')).getByText('What happens')).toBeTruthy()
  })

  it('after guided reasoning, asking again offers ways forward instead of repeating it', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(within(guidance()).getByRole('button', { name: 'Give me a hint' }))
    await user.click(within(screen.getByTestId('hint')).getByRole('button', { name: 'Stronger hint' }))
    await user.click(within(screen.getByTestId('hint')).getByRole('button', { name: 'Walk me through it' }))
    await user.click(within(screen.getByTestId('hint')).getByRole('button', { name: 'Close hint' }))
    await user.click(within(guidance()).getByRole('button', { name: 'Give me a hint' }))
    const next = screen.getByTestId('hint-exhausted')
    expect(next.textContent).toMatch(/You’ve seen the available evidence for this situation/)
    expect(within(next).getByRole('button', { name: /Investigate the database/ })).toBeTruthy()
    expect(within(next).getByRole('button', { name: 'Make a decision' })).toBeTruthy()
    await user.click(within(next).getByRole('button', { name: 'Revisit the evidence' }))
    expect(screen.getByTestId('hint').textContent).toMatch(/Guided reasoning/i)
  })

  it('keeps every dialog action in a footer outside the scrolling content', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Start the incident' }))
    let dialog = screen.getByRole('dialog')
    expect(within(within(dialog).getByTestId('modal-footer')).getByRole('button', { name: /Acknowledge/ })).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /Acknowledge/ }))
    await user.click(actionButton('^Scale the application(?! down)'))
    dialog = screen.getByRole('dialog')
    const footer = within(dialog).getByTestId('modal-footer')
    expect(within(footer).getByRole('button', { name: 'Commit decision' })).toBeTruthy()
    expect(within(dialog).getByTestId('modal-body').contains(within(dialog).getByLabelText('Why are you doing this?'))).toBe(true)
    // Submitting without a rationale brings the field back into view with the error.
    await user.click(within(footer).getByRole('button', { name: 'Commit decision' }))
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Why are you doing this?'))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/Write down your reasoning/)
    // Escape closes it and focus stays usable.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reviews reasoning and help used in the postmortem, and explains a counterfactual', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(within(guidance()).getByRole('button', { name: 'Give me a hint' }))
    await decide(user, 'Investigate the database', 'Is it the database?')
    await decide(user, 'Add a Redis cache', 'Reads dominate')
    await user.click(screen.getByRole('button', { name: /Play out to the end/ }))
    await user.click(screen.getAllByRole('button', { name: 'Read the postmortem' })[0]!)
    const review = screen.getByRole('region', { name: 'Decision quality' })
    expect(within(review).getByTestId('recovered').textContent).toMatch(/You recovered the system at T\+\d\d|did not recover/)
    expect(within(review).getByRole('list', { name: 'Reasoning checks' }).textContent).toMatch(/Investigated before making a capacity change|Measured the database/)
    expect(within(review).getByTestId('guidance-used').textContent).toMatch(/1 time/)
    expect(within(review).getByText('Guidance does not affect your score.')).toBeTruthy()
    expect(within(review).getByTestId('learning').textContent).toMatch(/What you can learn:/)
    await user.selectOptions(screen.getByLabelText('Instead of'), '1')
    await user.selectOptions(screen.getByLabelText('I would have'), 'scale-application')
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    const why = screen.getByTestId('counterfactual-why')
    expect(why.textContent).toMatch(/Your decision.*Add a Redis cache.*Goal:/)
    expect(why.textContent).toMatch(/Alternative.*Scale the application.*Goal:/)
  })
})

