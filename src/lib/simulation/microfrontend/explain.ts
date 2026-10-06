import { MODULES, MODULE_LABELS, type MfeConfig, type MfeMetrics } from './types'

export type Tone = 'healthy' | 'warning' | 'failed'

export interface Explanation {
  tone: Tone
  headline: string
  details: string[]
}

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * Explains the current state in plain engineering language. Rule-based on
 * purpose: each branch maps to one architectural cause.
 */
export function explainState(config: MfeConfig, metrics: MfeMetrics): Explanation {
  const isMfe = config.mode === 'microfrontends'
  const failing = config.failure === 'none' ? null : config.failure
  const details: string[] = []

  if (failing && !isMfe) {
    const others = MODULES.filter((m) => m !== failing).map((m) => MODULE_LABELS[m])
    return {
      tone: 'failed',
      headline: `${MODULE_LABELS[failing]} crashed and took the whole application down.`,
      details: [
        `In a monolith every module ships in one bundle and shares one runtime, so a fatal error in ${MODULE_LABELS[failing]} breaks the entire page.`,
        `${others.join(' and ')} have nothing wrong with them, but users cannot reach them. Availability is ${pct(metrics.availability)}.`,
        'Fixing it means rebuilding and redeploying the whole application.',
      ],
    }
  }

  if (failing) {
    const label = MODULE_LABELS[failing]
    let headline = `${label} MFE is unavailable. The rest of the application keeps working.`
    const others = MODULES.filter((m) => m !== failing).map((m) => MODULE_LABELS[m])
    details.push(
      `Because the application shell loads each microfrontend independently, ${others.join(' and ')} stay available. The shell renders a fallback in the ${label} slot instead of crashing.`,
    )
    if (config.caching) {
      details.push(`Caching lets some ${label} requests be served from a stale cached copy (${pct(metrics.moduleCacheRate[failing])} right now), so users see old data instead of an error.`)
    }
    if (!config.lazyLoading) {
      details.push('Modules are loaded eagerly, so the shell waits for the dead remote to time out before it can render anything. Every page is slower, not just the broken one.')
      headline = `${label} MFE is down, and eager loading is slowing every page.`
    }
    if (!config.independentDeployment) {
      details.push('Microfrontends are released together, so fixing one module means rolling back or redeploying all of them. Healthy modules see errors and extra latency during the coupled release.')
      headline = `${label} MFE is down, and the shared release is spreading the damage.`
    }
    details.push(`Availability is ${pct(metrics.availability)}, limited to roughly the share of traffic that ${label} handles.`)
    return { tone: 'warning', headline, details }
  }

  // No injected failure: explain the network and API conditions.
  let tone: Tone = 'healthy'
  let headline = isMfe
    ? 'All microfrontends are healthy and serving traffic.'
    : 'The monolith is healthy and serving traffic.'

  if (config.apiFailureRate >= 0.1) {
    tone = 'warning'
    headline = `Backend APIs are failing ${pct(config.apiFailureRate)} of calls.`
    details.push(
      config.caching
        ? 'The cache absorbs part of the failures: cache hits never reach the API, and some failed calls fall back to stale data.'
        : 'Without a cache, every API failure becomes a user-visible error. Try enabling caching.',
    )
  }
  if (config.latencyMs >= 250) {
    tone = 'warning'
    details.push(
      isMfe
        ? `Network latency of ${config.latencyMs} ms hurts microfrontends twice: once fetching the remote module and again calling its API.`
        : `Network latency of ${config.latencyMs} ms is added to every API call.`,
    )
  }
  if (details.length === 0) {
    details.push(
      isMfe
        ? 'Each microfrontend is owned, built and deployed by its own team. Take one offline to see how the failure is contained.'
        : 'Everything is built and deployed as one unit. Take a module offline to see what a single failure does to the whole page.',
    )
  }
  details.push(`Average latency is ${Math.round(metrics.latency)} ms with ${pct(metrics.availability)} availability.`)
  return { tone, headline, details }
}

export type ControlKey = keyof MfeConfig

/** Why a given change matters: shown right after the user flips a control. */
export function explainChange(key: ControlKey, config: MfeConfig): string {
  switch (key) {
    case 'mode':
      return config.mode === 'monolith'
        ? 'Switched to a monolith: one build, one deployment, one runtime. Simpler to run, but every module now shares the same blast radius.'
        : 'Switched to microfrontends: each module is built and deployed on its own and composed at runtime by the shell.'
    case 'failure':
      return config.failure === 'none'
        ? 'Restored all modules. Watch availability recover in the metrics.'
        : `Took ${MODULE_LABELS[config.failure]} offline. Compare how far the failure spreads in each architecture mode.`
    case 'latencyMs':
      return 'Network latency affects every hop. Microfrontends make more network hops than a monolith, so they feel it more.'
    case 'apiFailureRate':
      return 'API failures turn into user-visible errors unless something, like a cache, absorbs them.'
    case 'caching':
      return config.caching
        ? 'Caching cuts latency and can serve stale data when a dependency fails. The cost is freshness and cache invalidation.'
        : 'Without a cache, every request goes to the API, and every API failure reaches the user.'
    case 'lazyLoading':
      return config.lazyLoading
        ? 'Lazy loading fetches a module only when it is visited, so a dead module only breaks its own slot.'
        : 'Eager loading fetches every module at startup. It avoids a delay on first navigation, but startup now depends on every remote being up.'
    case 'independentDeployment':
      return config.independentDeployment
        ? 'Each team deploys on its own schedule, and a bad release can be rolled back without touching other modules.'
        : 'Modules ship together on a release train. Coordination is simpler, but one bad module holds back or rolls back everyone.'
  }
}
