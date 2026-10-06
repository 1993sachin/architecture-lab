/**
 * Seedable PRNG (mulberry32). Simulations keep the seed in their state so the
 * same seed and the same inputs always produce the same run, which keeps
 * them reproducible and testable.
 */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  const next = (seed + 0x6d2b79f5) | 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, next]
}

/** Small stateful wrapper for code that draws many numbers in one step. */
export class Rng {
  constructor(public seed: number) {}
  next(): number {
    const [value, seed] = nextRandom(this.seed)
    this.seed = seed
    return value
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  /** Picks a key with probability proportional to its weight. */
  weighted<T extends string>(weights: Record<T, number>): T {
    const entries = Object.entries(weights) as Array<[T, number]>
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    let roll = this.next() * total
    for (const [key, w] of entries) {
      roll -= w
      if (roll < 0) return key
    }
    return entries[entries.length - 1][0]
  }
}
