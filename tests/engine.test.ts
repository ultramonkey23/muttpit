import { describe, expect, it } from "vitest";
import { simulateBattle, validateKennel, effectiveStats, dogFingerprint, type Dog } from "../src/engine/battle";
import { TRICKS, STRAINS } from "../src/engine/content";
import { mulberry32, fnv1a } from "../src/engine/rng";

function dog(name: string, strain: Dog["strain"], grit: number, fang: number, flea: number, order: string[]): Dog {
  return { id: name, name, strain, grit, fang, flea, biteOrder: order, scars: [] };
}

const kennelA = [
  dog("Big Sad", "brute", 2, 3, 1, ["maul", "cower", "snap"]),
  dog("Nubbins", "grem", 1, 4, 3, ["flurry", "mudtoss"]),
  dog("Pockets", "cur", 2, 2, 2, ["fleabite", "sic", "snap"]),
];

const kennelB = [
  dog("Duchess", "bonehound", 3, 2, 2, ["boneshield", "snap", "maul"]),
  dog("Teeth", "pupp", 1, 3, 5, ["backbite", "playdead", "flurry"]),
  dog("Gasket", "mongrel", 3, 2, 3, ["packpounce", "howl", "snap"]),
];

describe("battle engine", () => {
  it("is deterministic: identical inputs replay identical logs", () => {
    const r1 = simulateBattle(kennelA, kennelB, 12345);
    const r2 = simulateBattle(kennelA, kennelB, 12345);
    expect(r1.logHash).toBe(r2.logHash);
    expect(r1.winner).toBe(r2.winner);
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events));
  });

  it("different seeds can diverge (the seed actually feeds the fight)", () => {
    const hashes = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      hashes.add(simulateBattle(kennelA, kennelB, seed).logHash);
    }
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("always terminates with a verdict and a non-empty log", () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = simulateBattle(kennelA, kennelB, seed);
      expect([-1, 0, 1]).toContain(r.winner);
      expect(r.rounds).toBeGreaterThan(0);
      expect(r.events.length).toBeGreaterThan(3);
    }
  });

  it("honors strain traits: bonehound opens with shield", () => {
    const r = simulateBattle(kennelA, [dog("Boney", "bonehound", 4, 2, 2, ["snap"])], 7);
    const shieldEvent = r.events.find((e) => e.text.includes("SHIELD 3"));
    expect(shieldEvent).toBeDefined();
  });

  it("honors bleed ticks", () => {
    const bleeder = [dog("Pockets", "cur", 4, 4, 6, ["fleabite", "fleabite"])];
    const dummy = [dog("Wall", "brute", 10, 1, 1, ["cower"])];
    const r = simulateBattle(bleeder, dummy, 3);
    expect(r.events.some((e) => e.text.includes("bleeds for"))).toBe(true);
  });

  it("effectiveStats folds scars in", () => {
    const d = dog("Scarred", "mongrel", 0, 0, 0, ["snap"]);
    d.scars = [{ id: "renown", name: "Renown", text: "", dGrit: 0, dFang: 1, dFlea: 0 }];
    const eff = effectiveStats(d);
    expect(eff.fang).toBe(STRAINS.mongrel.base.fang + 1);
  });

  it("dogFingerprint is version-locked to the build", () => {
    const d = dog("Locky", "mongrel", 1, 1, 1, ["snap", "maul"]);
    const f1 = dogFingerprint(d);
    d.biteOrder = ["maul", "snap"];
    expect(dogFingerprint(d)).not.toBe(f1);
  });
});

describe("kennel validation", () => {
  it("rejects unknown tricks and empty orders", () => {
    const bad = dog("Bad", "mongrel", 1, 1, 1, ["nuke"]);
    const check = validateKennel([bad]);
    expect(check.ok).toBe(false);
    const empty = dog("Empty", "mongrel", 1, 1, 1, []);
    expect(validateKennel([empty]).ok).toBe(false);
  });

  it("rejects duplicate ids and oversized kennels", () => {
    const a = dog("Same", "mongrel", 1, 1, 1, ["snap"]);
    const b = dog("Same", "grem", 1, 1, 1, ["snap"]);
    expect(validateKennel([a, b]).ok).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => dog(`D${i}`, "mongrel", 1, 1, 1, ["snap"]));
    expect(validateKennel(five).ok).toBe(false);
  });

  it("accepts a legal kennel", () => {
    expect(validateKennel(kennelA).ok).toBe(true);
  });
});

describe("content truth", () => {
  it("every trick referenced by name resolves and every effect is well-formed", () => {
    for (const trick of Object.values(TRICKS)) {
      expect(trick.name.length).toBeGreaterThan(0);
      expect(trick.effects.length).toBeGreaterThan(0);
      for (const e of trick.effects) {
        expect(["damage", "damageAll", "heal", "shield", "apply"]).toContain(e.kind);
      }
    }
  });

  it("rng is a real deterministic generator", () => {
    const a = mulberry32(fnv1a("pit"));
    const b = mulberry32(fnv1a("pit"));
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});
