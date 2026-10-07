import { describe, expect, it } from "vitest";
import { RATTLE_BASE_PRICE, rattlePrice } from "../src/league/pound";

/** How many rattles a purse buys in one week, paying the escalating price. */
function rattlesAffordable(scrap: number): number {
  let left = scrap;
  let n = 0;
  while (left >= rattlePrice(n)) {
    left -= rattlePrice(n);
    n++;
  }
  return n;
}

describe("rattle price — escalates within a week", () => {
  it("doubles from the base: 5, 10, 20, 40, 80, 160", () => {
    expect([0, 1, 2, 3, 4, 5].map(rattlePrice)).toEqual([5, 10, 20, 40, 80, 160]);
    expect(rattlePrice(0)).toBe(RATTLE_BASE_PRICE);
  });

  it("is pure and deterministic, and strictly increasing", () => {
    for (let n = 0; n < 12; n++) {
      expect(rattlePrice(n)).toBe(rattlePrice(n));
      expect(rattlePrice(n + 1)).toBeGreaterThan(rattlePrice(n));
    }
  });

  it("treats a missing/garbage count as a fresh week", () => {
    expect(rattlePrice(-3)).toBe(5);
    expect(rattlePrice(Number.NaN)).toBe(5);
    expect(rattlePrice(Number.POSITIVE_INFINITY)).toBe(5);
    expect(rattlePrice(2.9)).toBe(20);
  });

  it("a week's income affords a handful of rattles, a whole season's purse stays bounded", () => {
    // ~30 scrap per win; a full ~480 purse used to buy ~96 flat rattles
    expect(rattlesAffordable(30)).toBe(2);
    expect(rattlesAffordable(35)).toBe(3);
    expect(rattlesAffordable(150)).toBe(4);
    expect(rattlesAffordable(480)).toBe(6);
    expect(rattlesAffordable(480)).toBeLessThanOrEqual(6);
  });
});
