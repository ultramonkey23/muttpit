/** Deterministic RNG + hashing. Every Pit verdict is replayable from these. */

export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roll an integer in [0, n) */
export function rollInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/** Roll a signed nick in [-1, 1] — the only damage variance the Pit allows. */
export function nick(rng: () => number): number {
  return rollInt(rng, 3) - 1;
}
