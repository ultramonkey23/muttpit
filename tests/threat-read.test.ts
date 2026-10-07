import { describe, expect, it } from "vitest";
import { MAX_THREAT_LINES, threatRead, type ThreatLine } from "../src/league/threatRead";
import type { Dog } from "../src/engine/battle";

function dog(
  name: string,
  strain: Dog["strain"],
  grit: number,
  fang: number,
  flea: number,
  order: string[],
): Dog {
  return {
    id: `id-${name.toLowerCase()}`,
    name,
    strain,
    grit,
    fang,
    flea,
    biteOrder: order,
    scars: [],
  };
}

const lineup: Dog[] = [
  dog("Brick", "brute", 2, 1, 1, ["maul", "cower"]),
  dog("Wick", "cur", 1, 2, 1, ["fleabite", "sic"]),
  dog("Quick", "pupp", 1, 1, 2, ["whiffle", "snap"]),
];
const bench: Dog = dog("Benchwarmer", "mongrel", 1, 1, 1, ["snap"]);

const fleaTiePupp: Dog[] = [
  dog("Slowpaw", "mongrel", 1, 1, 3, ["snap"]),
  dog("Zip", "pupp", 1, 1, 0, ["snap"]),
];
const fleaTiePlain: Dog[] = [
  dog("Front", "mongrel", 1, 1, 3, ["snap"]),
  dog("Rear", "grem", 1, 1, 3, ["snap"]),
];
const fleaTieSpeedWins: Dog[] = [
  dog("Sprinter", "mongrel", 1, 1, 5, ["snap"]),
  dog("Zip", "pupp", 1, 1, 0, ["snap"]),
];
const bleedPack: Dog[] = [
  dog("Needle", "cur", 1, 1, 1, ["fleabite", "shriek"]),
  dog("Wall", "brute", 1, 1, 1, ["snap"]),
];
const shieldPack: Dog[] = [
  dog("Crypt", "bonehound", 2, 1, 1, ["boneshield", "snap"]),
  dog("Wall", "mongrel", 1, 1, 2, ["snap"]),
];
const barragePack: Dog[] = [
  dog("Static", "grem", 1, 1, 1, ["shriek", "snap"]),
  dog("Wall", "brute", 1, 1, 1, ["snap"]),
];
const solo: Dog[] = [dog("Lone", "mongrel", 1, 1, 1, ["maul", "cower"])];

const fixtures: Dog[][] = [
  lineup,
  fleaTiePupp,
  fleaTiePlain,
  fleaTieSpeedWins,
  bleedPack,
  shieldPack,
  barragePack,
  solo,
  [...lineup, bench],
];

describe("threatRead", () => {
  it("is deterministic: the same build always reads the same", () => {
    const a = threatRead(lineup);
    const b = threatRead([...lineup]);
    const c = threatRead(lineup.map((d) => ({ ...d })));
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });

  it("never mutates the opponent build", () => {
    const before = JSON.stringify([...lineup, bench]);
    threatRead([...lineup, bench]);
    expect(JSON.stringify([...lineup, bench])).toBe(before);
  });

  it("names a real fighting dog on every line and never the bench", () => {
    const lines = threatRead([...lineup, bench]);
    const names = lineup.map((d) => d.name);
    const ids = lineup.map((d) => d.id);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(MAX_THREAT_LINES);
    for (const line of lines) {
      expect(names).toContain(line.dogName);
      expect(ids).toContain(line.dogId);
      expect(line.text).toContain(line.dogName);
      expect(line.text).not.toContain("Benchwarmer");
    }
  });

  it("reports a barrage trick as a hit that reaches the whole team", () => {
    const barr = threatRead(lineup).filter((l) => l.kind === "barrage");
    expect(barr).toHaveLength(1);
    expect(barr[0]?.dogName).toBe("Quick");
    const text = (barr[0]?.text ?? "").toLowerCase();
    expect(text).toContain("can hit the whole team");
    expect(text).toContain("back line");

    const shriek = threatRead(barragePack).filter((l) => l.kind === "barrage");
    expect(shriek[0]?.dogName).toBe("Static");
    expect((shriek[0]?.text ?? "").toLowerCase()).toContain("whole team");
  });

  it("identifies the fastest dog, with pupp winning FLEA ties the way the engine does", () => {
    expect(threatRead(lineup).find((l) => l.kind === "speed")?.dogName).toBe("Quick");

    const tie: ThreatLine | undefined = threatRead(fleaTiePupp).find((l) => l.kind === "speed");
    expect(tie?.dogName).toBe("Zip");
    expect(tie?.text).toContain("FLEA 7");
    expect(tie?.text).toContain("Pupp wins tick ties");

    // equal FLEA, no pupp in sight: the front slot acts first
    expect(threatRead(fleaTiePlain).find((l) => l.kind === "speed")?.dogName).toBe("Front");

    // a genuinely faster non-pupp still acts first
    expect(threatRead(fleaTieSpeedWins).find((l) => l.kind === "speed")?.dogName).toBe("Sprinter");
  });

  it("reports bleed stacks and who starts shielded as build facts", () => {
    const bleedLines = threatRead(bleedPack).filter((l) => l.kind === "bleed");
    expect(bleedLines.length).toBeGreaterThan(0);
    expect(bleedLines[0]?.dogName).toBe("Needle");
    const bleedText = (bleedLines[0]?.text ?? "").toLowerCase();
    expect(bleedText).toContain("bleed");
    expect(bleedText).toContain("bleed 1");
    expect(bleedText).toContain("bleed 2");

    const shieldLine = threatRead(shieldPack).find(
      (l) => l.kind === "shield" && l.dogName === "Crypt",
    );
    expect(shieldLine?.text).toContain("starts shielded");
    expect(shieldLine?.text).toContain("SHIELD 3");
    expect(shieldLine?.text).toContain("Bone Shield adds SHIELD 4");
  });

  it("keeps every line factual — no imperative advice words", () => {
    const banned = ["should", "must", "try", "swap", "move"];
    for (const fixture of fixtures) {
      for (const line of threatRead(fixture)) {
        const low = line.text.toLowerCase();
        for (const word of banned) {
          expect(low).not.toContain(word);
        }
      }
    }
  });

  it("reads nothing from an empty lineup and stays inside lineupSize", () => {
    expect(threatRead([])).toEqual([]);
    const only = threatRead([...lineup, bench], 1);
    expect(only.length).toBeGreaterThan(0);
    for (const line of only) expect(line.dogName).toBe("Brick");
  });
});
