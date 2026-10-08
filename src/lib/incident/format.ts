/** Display formatting for the Incident Runner. Presentation only: no simulation logic. */

/** `T+08`: logical minutes, zero-padded so the clock does not jump in width. */
export function clock(minutes: number): string {
  return `T+${String(minutes).padStart(2, '0')}`
}

export function rps(value: number): string {
  if (value >= 1000) return `${trim(value / 1000)}K rps`
  return `${Math.round(value)} rps`
}

export function ms(value: number): string {
  if (value >= 1000) return `${trim(value / 1000, 2)} s`
  return `${Math.round(value)} ms`
}

export function percent(ratio: number, digits = 1): string {
  const value = ratio * 100
  if (value !== 0 && Math.abs(value) < 0.1) return `${value.toFixed(2)}%`
  return `${trim(value, digits)}%`
}

export function usd(value: number, digits = 0): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

export function count(value: number): string {
  if (value >= 1e6) return `${trim(value / 1e6)}M`
  if (value >= 1e3) return `${trim(value / 1e3)}K`
  return String(Math.round(value))
}

export function signedUsd(value: number): string {
  return `${value >= 0 ? '+' : '−'}${usd(Math.abs(value))}`
}

export function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${trim(Math.abs(value))}`
}

function trim(value: number, digits = 1): string {
  return Number(value.toFixed(digits)).toString()
}

/** Formats a tile value by its unit. */
export function metricValue(unit: 'rps' | 'ms' | 'ratio' | 'usd' | 'messages', value: number): string {
  switch (unit) {
    case 'rps':
      return rps(value)
    case 'ms':
      return ms(value)
    case 'ratio':
      return percent(value)
    case 'usd':
      return `${usd(value)}/mo`
    case 'messages':
      return count(value)
  }
}
