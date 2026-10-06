import { describe, expect, it } from "vitest";
import { poundOffers } from "../src/league/pound";
import { validateKennel } from "../src/engine/battle";

function totalStats(seed: number, heat: number): number {
  const o = poundOffers(seed, heat);
  return o.dogs.reduce((s, d) => s + d.grit + d.fang + d.flea, 0);
}

const SEEDS = [1, 7, 42, 88, 123, 999, 31337];

describe("pound offers — progression heat", () => {
  it("is deterministic for the same seed and heat", () => {
    for (const seed of SEEDS) {
      for (const heat of [0, 3, 6, 9]) {
        const a = poundOffers(seed, heat);
        const b = poundOffers(seed, heat);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });

  it("rolls strictly more total stats as heat climbs (monotonicity)", () => {
    for (const seed of SEEDS) {
      expect(totalStats(seed, 6)).toBeGreaterThan(totalStats(seed, 0));
    }
  });

  it("keeps the single-argument signature working (heat defaults to 0)", () => {
    const legacy = poundOffers(88);
    const explicit = poundOffers(88, 0);
    expect(JSON.stringify(legacy)).toBe(JSON.stringify(explicit));
    expect(legacy.dogs.length).toBe(3);
    expect(legacy.tricks.length).toBe(3);
    for (const d of legacy.dogs) {
      expect(validateKennel([d]).ok).toBe(true);
    }
  });
});
