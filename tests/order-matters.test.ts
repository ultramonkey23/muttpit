import { describe, expect, it } from "vitest";
import { simulateBattle, type Dog } from "../src/engine/battle";
import { TRICKS } from "../src/engine/content";

function dog(id: string, name: string, strain: Dog["strain"], grit: number, fang: number, flea: number, order: string[]): Dog {
  return { id, name, strain, grit, fang, flea, biteOrder: order, scars: [] };
}

const ME: Dog[] = [
  dog("a", "Alpha", "mongrel", 15, 8, 6, ["snap", "snap", "snap", "snap"]),
  dog("b", "Bravo", "cur", 12, 7, 8, ["flurry", "snap", "flurry", "snap"]),
  dog("c", "Charlie", "brute", 18, 6, 3, ["bonecrack", "cower", "snap", "snap"]),
];

const THEM: Dog[] = [
  dog("x", "Xray", "bonehound", 14, 8, 7, ["maul", "snap", "maul", "snap"]),
  dog("y", "Yankee", "grem", 11, 9, 8, ["flurry", "spite", "snap", "snap"]),
  dog("z", "Zulu", "pupp", 16, 5, 5, ["boneshield", "snap", "goad", "snap"]),
];

function withOrder(dogs: Dog[], dogIdx: number, order: string[]): Dog[] {
  return dogs.map((d, i) => (i === dogIdx ? { ...d, biteOrder: order } : d));
}

function winners(a: Dog[], b: Dog[], seeds: number[]): number[] {
  return seeds.map((s) => simulateBattle(a, b, s).winner);
}

const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 7);

describe("the bite order is a real decision", () => {
  it("changing one dog's bite order flips outcomes in some seeded bouts", () => {
    const baseline = winners(ME, THEM, SEEDS);
    const variants = [
      withOrder(ME, 0, ["cower", "snap", "snap", "bonecrack"]),
      withOrder(ME, 1, ["mudtoss", "flurry", "mudtoss", "flurry"]),
      withOrder(ME, 2, ["boneshield", "packpounce", "snap", "playdead"]),
    ];
    let flips = 0;
    for (const v of variants) {
      const w = winners(v, THEM, SEEDS);
      flips += w.filter((wi, i) => wi !== baseline[i]).length;
    }
    expect(flips).toBeGreaterThan(0);
  });

  it("the trick catalogue backing those orders actually exists", () => {
    for (const d of ME.concat(THEM)) {
      for (const t of d.biteOrder) {
        expect(t in TRICKS).toBe(true);
      }
    }
  });
});
