/**
 * Tiny codec helpers for shareable experiment URLs. Each experiment maps its
 * own state to query parameters; these keep parsing strict, so a hand-edited
 * or stale link falls back to defaults instead of producing invalid state.
 */

export function readBool(params: URLSearchParams, key: string): boolean | undefined {
  const v = params.get(key)
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return undefined
}

export function readEnum<T extends string | number>(params: URLSearchParams, key: string, allowed: readonly T[]): T | undefined {
  const v = params.get(key)
  if (v === null) return undefined
  return allowed.find((a) => String(a) === v)
}

export function readList<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]): T[] | undefined {
  const v = params.get(key)
  if (v === null) return undefined
  return v
    .split(',')
    .filter((item): item is T => (allowed as readonly string[]).includes(item))
    .filter((item, i, all) => all.indexOf(item) === i)
}

/** Builds a query string, leaving out parameters that are at their default. */
export function writeParams(entries: Array<[key: string, value: string | number | boolean, isDefault: boolean]>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value, isDefault] of entries) {
    if (!isDefault) params.set(key, String(value))
  }
  return params
}
