/**
 * Deterministic PRNG based on a seed string.
 * Uses mulberry32 internally, seeded from a string hash.
 * No external dependencies.
 */

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRng {
  private next: () => number;
  private callCount = 0;

  constructor(seed: string) {
    this.next = mulberry32(hashString(seed));
  }

  /** Returns a float in [0, 1). */
  random(): number {
    this.callCount++;
    return this.next();
  }

  /** Returns an integer in [min, max] (inclusive). */
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /** Returns a float in [min, max). */
  randomFloat(min: number, max: number): number {
    return this.random() * (max - min) + min;
  }

  /** Picks a random element from the array. */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) throw new Error('Cannot pick from empty array');
    return array[this.randomInt(0, array.length - 1)];
  }

  /** Returns a shuffled copy of the array (Fisher-Yates). */
  shuffle<T>(array: readonly T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** Returns true with the given probability (0-1). */
  chance(probability: number): boolean {
    return this.random() < probability;
  }

  /** Samples from a normal distribution using the Box-Muller transform. */
  gaussian(mean: number, stddev: number): number {
    const u1 = this.random();
    const u2 = this.random();
    // Avoid log(0)
    const safeU1 = u1 === 0 ? Number.EPSILON : u1;
    const z0 = Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stddev + mean;
  }

  /** Generates a deterministic UUID-like string (v4 format, not cryptographically random). */
  uuid(): string {
    const hex = (n: number, len: number): string =>
      Math.floor(n * (16 ** len))
        .toString(16)
        .padStart(len, '0');

    const a = hex(this.random(), 8);
    const b = hex(this.random(), 4);
    const c = hex(this.random(), 4);
    const d = hex(this.random(), 4);
    const e = hex(this.random(), 12);

    // Set version nibble to 4 and variant bits
    const cVersioned = '4' + c.slice(1);
    const dVariant =
      ((parseInt(d[0], 16) & 0x3) | 0x8).toString(16) + d.slice(1);

    return `${a}-${b}-${cVersioned}-${dVariant}-${e}`;
  }

  /** Returns how many random values have been drawn (useful for debugging reproducibility). */
  get draws(): number {
    return this.callCount;
  }
}
