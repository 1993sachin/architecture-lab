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
  })

  it('confirms a decision with its cost, complexity, effect and risks', async () => {
    const user = setup()
    await takeIncident(user)
    await user.click(actionButton('Add a Redis cache'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Expected effect')).toBeTruthy()
    expect(within(dialog).getByText(/Serve reads from Redis/)).toBeTruthy()
    expect(within(dialog).getByText('+$256/mo')).toBeTruthy()
    expect(within(dialog).getByText('+3')).toBeTruthy()
    expect(within(dialog).getByText('Potential risks')).toBeTruthy()
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
    expect(within(transition).getByTestId('why-this-happened').textContent).toMatch(/Redis now answers/)
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
