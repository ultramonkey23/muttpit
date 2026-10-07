import { describe, expect, it } from "vitest";
import { playWeek, startSeason } from "../src/league/season";
import { scarsBackToKennel, withCurrentKennel } from "../src/league/seasonSync";
import type { Kennel } from "../src/async/packets";
import type { Dog } from "../src/engine/battle";

const dog = (id: string, strain: Dog["strain"], order: string[]): Dog => ({
  id, name: id, strain, grit: 2, fang: 3, flea: 2, biteOrder: order, scars: [],
});

function kennel(): Kennel {
  return {
    v: 1, name: "Bucket Kennels", motto: "Lose small. Scar big.",
    dogs: [
      dog("big-sad", "brute", ["maul", "cower", "snap"]),
      dog("nubbins", "grem", ["flurry", "mudtoss"]),
      dog("pockets", "cur", ["fleabite", "sic", "snap"]),
      dog("wobbles", "mongrel", ["packpounce", "howl"]),
    ],
  };
}

describe("season fights the kennel as it stands", () => {
  it("a lineup change made after Start Season reaches the next bout", () => {
    const k = kennel();
    const st = startSeason(k, 1234, 0, 1, 150);
    // bench the front dog after the season started
    k.dogs.push(k.dogs.shift()!);
    const outcome = playWeek(withCurrentKennel(st, k, 150));
    const fighters = outcome.result.events.filter((e) => e.kind === "trick" && e.actor).map((e) => e.actor);
    expect(fighters).not.toContain("big-sad");
    expect(fighters).toContain("wobbles");
  });

  it("the stale snapshot would have fought the old lineup (guards the regression)", () => {
    const k = kennel();
    const st = startSeason(k, 1234, 0, 1, 150);
    k.dogs.push(k.dogs.shift()!);
    const outcome = playWeek(st);
    const fighters = outcome.result.events.filter((e) => e.kind === "trick" && e.actor).map((e) => e.actor);
    expect(fighters).toContain("big-sad");
  });

  it("scrap spent in the Pound stays spent", () => {
    const k = kennel();
    const st = startSeason(k, 99, 0, 1, 150);
    const outcome = playWeek(withCurrentKennel(st, k, 110)); // 40 spent after the season started
    const earned = outcome.state.playerResults[0].scrapEarned;
    expect(outcome.state.scrap).toBe(110 + earned);
  });

  it("season scars land on the player's own dogs and carry into the next week", () => {
    const k = kennel();
    let st = startSeason(k, 7, 0, 1, 150);
    let scarred = 0;
    for (let w = 0; w < 8 && scarred === 0; w++) {
      st = playWeek(withCurrentKennel(st, k, st.scrap)).state;
      scarsBackToKennel(k, st);
      scarred = k.dogs.reduce((n, d) => n + d.scars.length, 0);
    }
    expect(scarred).toBeGreaterThan(0);
    // the next week's snapshot is built from the kennel, so it carries those scars
    const next = withCurrentKennel(st, k, st.scrap);
    for (const d of k.dogs) {
      expect(next.player.dogs.find((x) => x.id === d.id)!.scars).toEqual(d.scars);
    }
  });

  it("a rename after Start Season is the name the standings use", () => {
    const k = kennel();
    const st = startSeason(k, 5, 0, 1, 150);
    k.name = "Gutter Court";
    expect(withCurrentKennel(st, k, 150).player.name).toBe("Gutter Court");
  });
});
