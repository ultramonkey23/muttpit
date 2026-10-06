import { describe, expect, it } from "vitest";
import { simulateBattle, effectiveStats, type Dog } from "../src/engine/battle";

function dog(
  name: string,
  strain: Dog["strain"],
  grit: number,
  fang: number,
  flea: number,
  order: string[],
): Dog {
  return { id: name, name, strain, grit, fang, flea, biteOrder: order, scars: [] };
}

describe("grem VOLATILE trait", () => {
  const gremTeam = [
    dog("Grem1", "grem", 3, 3, 3, ["snap", "maul", "flurry"]),
    dog("Grem2", "grem", 3, 3, 3, ["maul", "snap", "sic"]),
    dog("Grem3", "grem", 3, 3, 3, ["flurry", "maul", "snap"]),
  ];

  const oppTeam = [
    dog("Brute1", "brute", 3, 3, 3, ["maul", "snap", "cower"]),
    dog("Cur1", "cur", 3, 3, 3, ["fleabite", "sic", "snap"]),
    dog("Mong1", "mongrel", 3, 3, 3, ["packpounce", "howl", "snap"]),
  ];

  it("fires in at least 25% of bouts where a grem fights (60 fixed seeds)", () => {
    const gremMaxHp = effectiveStats(gremTeam[0]).grit;
    const threshold = gremMaxHp * 0.75;
    let triggerCount = 0;
    const totalBouts = 60;

    for (let seed = 1; seed <= totalBouts; seed++) {
      const result = simulateBattle(gremTeam, oppTeam, seed);
      const traitFired = result.events.some((e) => {
        if (!e.hp) return false;
        const hp = e.hp["0:Grem1"];
        return hp !== undefined && hp < threshold;
      });
      if (traitFired) triggerCount += 1;
    }

    const rate = triggerCount / totalBouts;
    expect(rate).toBeGreaterThanOrEqual(0.25);
  });

  it("grants +2 FANG to a bloodied grem (verified via snap damage output)", () => {
    // Two grems with identical low-fang stats fight each other.
    // Base fang = 5 (STRAINS.grem.base.fang + 0 bonus).
    // Without VOLATILE: snap damage = 5 + nick, range [4, 6].
    // With VOLATILE firing (hp < 75% threshold): snap damage = 7 + nick, range [6, 8].
    // A damage of 7 or 8 is only reachable when VOLATILE is active
    // (max damage without VOLATILE is 6, since base 5 + max nick +1 = 6).
    const ga = dog("GA", "grem", 3, 0, 3, ["snap"]);
    const gb = dog("GB", "grem", 3, 0, 3, ["snap"]);

    let observed = false;
    for (let seed = 1; seed <= 100 && !observed; seed++) {
      const result = simulateBattle([ga], [gb], seed);
      for (const e of result.events) {
        if (e.kind !== "hit") continue;
        const match = e.text.match(/takes (\d+)/);
        if (!match) continue;
        const dmg = parseInt(match[1], 10);
        if (dmg >= 7) {
          observed = true;
          break;
        }
      }
    }

    expect(observed).toBe(true);
  });
});
