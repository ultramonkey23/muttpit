import { describe, expect, it } from "vitest";
import { simulateBattle, type BattleEvent, type BattleResult, type Dog } from "../src/engine/battle";
import { MAX_ROUNDS } from "../src/engine/content";
import { summarizeBout, type BoutReport, type DogReport, type PitNote } from "../src/boutReport";

function dog(name: string, strain: Dog["strain"], grit: number, fang: number, flea: number, order: string[]): Dog {
  return { id: name, name, strain, grit, fang, flea, biteOrder: order, scars: [] };
}

const ME: Dog[] = [
  dog("Alpha", "mongrel", 15, 8, 6, ["snap", "snap", "snap", "snap"]),
  dog("Bravo", "cur", 12, 7, 8, ["flurry", "snap", "flurry", "snap"]),
  dog("Charlie", "brute", 18, 6, 3, ["bonecrack", "cower", "snap", "snap"]),
];

const THEM: Dog[] = [
  dog("Xray", "bonehound", 14, 8, 7, ["maul", "snap", "maul", "snap"]),
  dog("Yankee", "grem", 11, 9, 8, ["flurry", "spite", "snap", "snap"]),
  dog("Zulu", "pupp", 16, 5, 5, ["boneshield", "snap", "goad", "snap"]),
];

const MEDICS: Dog[] = [
  dog("Doc", "mongrel", 4, 3, 5, ["lickwounds", "secondwind"]),
  dog("Tank", "brute", 8, 4, 2, ["maul", "snap"]),
  dog("Zip", "pupp", 6, 5, 4, ["snap", "backbite"]),
];

const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 7);

const MATCHUPS: [string, Dog[], Dog[]][] = [
  ["ME vs THEM", ME, THEM],
  ["MEDICS vs THEM", MEDICS, THEM],
  ["THEM vs MEDICS", THEM, MEDICS],
];

function allDogs(report: BoutReport): DogReport[] {
  return [...report.dogs[0], ...report.dogs[1]];
}

function notesOf(report: BoutReport, kind: PitNote["kind"]): PitNote[] {
  return report.notes.filter((n) => n.kind === kind);
}

describe("summarizeBout: determinism", () => {
  it("returns identical readouts for identical bouts and leaves the result untouched", () => {
    const result = simulateBattle(ME, THEM, 4242);
    const before = JSON.stringify(result);
    const one = summarizeBout(result, [ME, THEM]);
    const two = summarizeBout(result, [ME, THEM]);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    expect(JSON.stringify(result)).toBe(before);
    const replay = summarizeBout(simulateBattle(ME, THEM, 4242), [ME, THEM]);
    expect(JSON.stringify(replay)).toBe(JSON.stringify(one));
  });

  it("copes with an empty log without throwing", () => {
    const empty: BattleResult = {
      winner: -1,
      rounds: 0,
      events: [],
      logHash: "00000000",
      survivorHp: [0, 0],
      survivors: [],
    };
    const report = summarizeBout(empty, [ME, THEM]);
    expect(report.exact).toBe(false);
    expect(report.notes).toEqual([]);
  });
});

describe("summarizeBout: totals reconcile with the log", () => {
  for (const [label, a, b] of MATCHUPS) {
    it(`${label}: every dog's grit adds up and team totals match the log`, () => {
      for (const seed of SEEDS) {
        const result = simulateBattle(a, b, seed);
        const report = summarizeBout(result, [a, b]);
        const dogs = allDogs(report);
        expect(report.exact).toBe(true);
        expect(report.winner).toBe(result.winner);
        expect(report.rounds).toBe(result.rounds);

        // grit in, grit out
        for (const d of dogs) {
          expect(d.startHp - d.damageTaken + d.healingReceived).toBe(d.endHp);
          expect(d.bleedTaken).toBeLessThanOrEqual(d.damageTaken);
        }
        // every point lost was either dealt by a bite or a bleed tick
        const sum = (f: (d: DogReport) => number): number => dogs.reduce((acc, d) => acc + f(d), 0);
        expect(sum((d) => d.damageTaken)).toBe(sum((d) => d.damageDealt) + sum((d) => d.bleedTaken));
        expect(sum((d) => d.healingDone)).toBe(sum((d) => d.healingReceived));

        // final grit agrees with the engine's own survivor tally
        for (const team of [0, 1] as const) {
          expect(report.dogs[team].reduce((acc, d) => acc + d.endHp, 0)).toBe(result.survivorHp[team]);
        }
        const up = dogs.filter((d) => d.downRound === null).map((d) => `${d.team}:${d.name}`);
        expect(up.sort()).toEqual(result.survivors.map((s) => `${s.team}:${s.name}`).sort());

        // counts that the log states outright
        const trickEvents = result.events.filter((e) => e.kind === "trick").length;
        expect(sum((d) => d.tricksPlayed)).toBe(trickEvents);
        expect(sum((d) => d.slots.reduce((acc, s) => acc + s.plays, 0))).toBe(trickEvents);
        const deaths = result.events.filter((e) => e.kind === "death");
        expect(dogs.filter((d) => d.downRound !== null).length).toBe(deaths.length);
        expect(sum((d) => d.kos)).toBe(deaths.filter((e) => e.actor !== undefined).length);

        const shieldText = result.events.reduce((acc, e) => {
          const m = /'s shield eats (\d+)\.$/.exec(e.text);
          return acc + (m ? Number(m[1]) : 0);
        }, 0);
        expect(sum((d) => d.shieldAbsorbed)).toBe(shieldText);

        // the log's own "takes N" / "bleeds for N" figures include overkill, so they bound ours
        const textDamage = result.events.reduce((acc, e) => {
          const m = /(?: takes| bleeds for) (\d+)\.$/.exec(e.text);
          return acc + (e.kind === "hit" && m ? Number(m[1]) : 0);
        }, 0);
        expect(sum((d) => d.damageTaken)).toBeLessThanOrEqual(textDamage);

        // team rollups are the sum of their dogs
        for (const team of [0, 1] as const) {
          const t = report.totals[team];
          expect(t.damageDealt).toBe(report.dogs[team].reduce((acc, d) => acc + d.damageDealt, 0));
          expect(t.kos).toBe(report.dogs[team].reduce((acc, d) => acc + d.kos, 0));
        }
      }
    });
  }

  it("notes state facts only and stay inside the known kinds", () => {
    const kinds = new Set(["turning-point", "first-ko", "judged", "carried", "no-damage", "dead-slot"]);
    for (const [, a, b] of MATCHUPS) {
      for (const seed of SEEDS) {
        const report = summarizeBout(simulateBattle(a, b, seed), [a, b]);
        for (const n of report.notes) {
          expect(kinds.has(n.kind)).toBe(true);
          expect(n.text).not.toMatch(/\b(should|try|better|instead|consider|must)\b/i);
        }
      }
    }
  });
});

describe("summarizeBout: Pit notes", () => {
  // Hammer is the only dog on its side that bites; Pal only shields itself.
  const HAMMER: Dog[] = [
    dog("Hammer", "brute", 6, 4, 0, ["maul"]),
    dog("Pal", "mongrel", 0, 0, 0, ["cower"]),
  ];
  const GREMS: Dog[] = [dog("Gnash", "grem", 0, 0, 0, ["snap"]), dog("Nipper", "grem", 0, 0, 0, ["snap"])];

  it("first-ko: names the first dog down, the round and the biter", () => {
    const report = summarizeBout(simulateBattle(HAMMER, GREMS, 7), [HAMMER, GREMS]);
    const [note] = notesOf(report, "first-ko");
    expect(note.team).toBe(1);
    expect(note.round).toBe(1);
    expect(note.subject).toEqual({ team: 1, slot: 0 });
    expect(note.text).toBe("Gnash (Team B) was the first dog down — round 1, to Hammer's bite.");
    expect(report.dogs[1][0].downRound).toBe(1);
    expect(report.dogs[1][0].downBy).toBe("Hammer");
    expect(report.dogs[0][0].kos).toBeGreaterThanOrEqual(1);
  });

  it("carried: says how much of a side's damage one dog dealt", () => {
    const report = summarizeBout(simulateBattle(HAMMER, GREMS, 7), [HAMMER, GREMS]);
    const mine = notesOf(report, "carried").find((n) => n.team === 0);
    expect(mine).toBeDefined();
    expect(mine!.subject).toEqual({ team: 0, slot: 0 });
    expect(mine!.text).toBe(`Hammer dealt ${report.dogs[0][0].damageDealt} of Team A's ${report.totals[0].damageDealt} damage (100%).`);
  });

  it("carried: omits a high share when the team's total is trivial for the bout", () => {
    const hugeGrems: Dog[] = [
      dog("Gnash", "grem", 1000, 0, 0, ["snap"]),
      dog("Nipper", "grem", 1000, 0, 0, ["snap"]),
    ];
    const report = summarizeBout(simulateBattle(HAMMER, hugeGrems, 7), [HAMMER, hugeGrems]);
    expect(report.totals[0].damageDealt).toBeGreaterThan(0);
    expect(report.totals[0].damageDealt).toBeLessThan(
      report.dogs[1].reduce((sum, d) => sum + d.startHp, 0) * 0.1,
    );
    expect(notesOf(report, "carried").some((n) => n.team === 0)).toBe(false);
  });

  it("no-damage: flags a dog that played tricks and never landed a bite", () => {
    const report = summarizeBout(simulateBattle(HAMMER, GREMS, 7), [HAMMER, GREMS]);
    const pal = notesOf(report, "no-damage").find((n) => n.subject?.team === 0 && n.subject.slot === 1);
    expect(pal).toBeDefined();
    expect(pal!.text).toMatch(/^Pal \(Team A\) played \d+ tricks? and never landed a bite/);
    expect(report.dogs[0][1].damageDealt).toBe(0);
    expect(report.dogs[0][1].tricksPlayed).toBeGreaterThan(0);
  });

  describe("a stalemate where nothing can hurt anything", () => {
    const A: Dog[] = [
      dog("Nurse", "mongrel", 0, 0, 0, ["lickwounds"]),
      dog("Fido", "mongrel", 0, 0, 0, ["playdead"]),
    ];
    const B: Dog[] = [dog("Rock", "bonehound", 0, 0, 0, ["cower"]), dog("Stone", "brute", 0, 0, 0, ["cower"])];

    it("judged: says the round limit decided it", () => {
      const result = simulateBattle(A, B, 3);
      expect(result.rounds).toBe(MAX_ROUNDS);
      const report = summarizeBout(result, [A, B]);
      const [note] = notesOf(report, "judged");
      expect(note.team).toBeNull();
      expect(note.text).toBe(`Neither side was finished off in ${MAX_ROUNDS} rounds; the judges counted remaining grit.`);
      expect(notesOf(report, "first-ko")).toEqual([]);
      expect(notesOf(report, "turning-point")).toEqual([]);
    });

    it("dead-slot: reports a bite order slot that played and did nothing", () => {
      const report = summarizeBout(simulateBattle(A, B, 3), [A, B]);
      const dead = notesOf(report, "dead-slot");
      expect(dead).toHaveLength(1);
      expect(dead[0].subject).toEqual({ team: 0, slot: 0 });
      expect(dead[0].text).toBe(
        `Nurse's bite 1 (Lick Wounds) played ${MAX_ROUNDS}× and landed no damage, healing or status.`,
      );
      const slot = report.dogs[0][0].slots[0];
      expect(slot.plays).toBe(MAX_ROUNDS);
      expect(slot.healing).toBe(0);
    });

    it("no-damage: adds what the dog did do instead of biting", () => {
      const report = summarizeBout(simulateBattle(A, B, 3), [A, B]);
      const texts = notesOf(report, "no-damage").map((n) => n.text);
      expect(texts).toEqual([
        `Nurse (Team A) played ${MAX_ROUNDS} tricks and never landed a bite.`,
        `Fido (Team A) played ${MAX_ROUNDS} tricks and never landed a bite (${MAX_ROUNDS} status plays).`,
      ]);
    });
  });

  describe("turning-point on a hand-built log", () => {
    // Round 1: Team B's Cy lands the big hit. Round 2: Ace answers and Cy goes down. Round 3: Bo finishes Di.
    const a = [dog("Ace", "mongrel", 0, 0, 0, ["snap"]), dog("Bo", "mongrel", 0, 0, 0, ["snap"])];
    const b = [dog("Cy", "mongrel", 0, 0, 0, ["snap"]), dog("Di", "mongrel", 0, 0, 0, ["snap"])];
    const hp: Record<string, number> = { "0:Ace": 10, "0:Bo": 10, "1:Cy": 10, "1:Di": 10 };
    const events: BattleEvent[] = [];
    const push = (
      round: number,
      kind: BattleEvent["kind"],
      text: string,
      actor?: string,
      target?: string,
      change?: [string, number],
    ): void => {
      if (change) hp[change[0]] = Math.max(0, hp[change[0]] + change[1]);
      events.push({ round, kind, text, actor, target, hp: { ...hp } });
    };
    push(0, "start", "The Pit locks the gate. Bout starts.");
    push(1, "trick", "Cy plays Snap.", "Cy");
    push(1, "hit", "Ace takes 6.", "Cy", "Ace", ["0:Ace", -6]);
    push(1, "trick", "Ace plays Snap.", "Ace");
    push(1, "hit", "Cy takes 2.", "Ace", "Cy", ["1:Cy", -2]);
    push(2, "trick", "Ace plays Snap.", "Ace");
    push(2, "hit", "Cy takes 8.", "Ace", "Cy", ["1:Cy", -8]);
    push(2, "death", "Cy goes down.", "Ace", "Cy");
    push(3, "trick", "Bo plays Snap.", "Bo");
    push(3, "hit", "Di takes 10.", "Bo", "Di", ["1:Di", -10]);
    push(3, "death", "Di goes down.", "Bo", "Di");
    push(3, "end", "Team A takes the bout.");
    const result: BattleResult = {
      winner: 0,
      rounds: 3,
      events,
      logHash: "00000000",
      survivorHp: [14, 0],
      survivors: [
        { team: 0, name: "Ace", hp: 4, maxHp: 10 },
        { team: 0, name: "Bo", hp: 10, maxHp: 10 },
      ],
    };
    const report = summarizeBout(result, [a, b]);

    it("names the round the lead changed hands for good, and what happened in it", () => {
      const [note] = notesOf(report, "turning-point");
      expect(note.team).toBe(0);
      expect(note.round).toBe(2);
      expect(note.subject).toEqual({ team: 1, slot: 0 });
      expect(note.text).toBe(
        "Round 2: Team A pulled ahead on remaining grit after trailing, and held it to the end — Cy went down that round.",
      );
    });

    it("reads each dog's facts straight off the log", () => {
      expect(report.exact).toBe(true);
      const [ace, bo] = report.dogs[0];
      const [cy, di] = report.dogs[1];
      expect([ace.damageDealt, ace.damageTaken, ace.kos]).toEqual([10, 6, 1]);
      expect([bo.damageDealt, bo.damageTaken, bo.kos]).toEqual([10, 0, 1]);
      expect([cy.damageDealt, cy.damageTaken, cy.downRound, cy.downBy]).toEqual([6, 10, 2, "Ace"]);
      expect([di.damageDealt, di.damageTaken, di.downRound, di.downBy]).toEqual([0, 10, 3, "Bo"]);
      expect([ace.tricksPlayed, bo.tricksPlayed, cy.tricksPlayed, di.tricksPlayed]).toEqual([2, 1, 1, 0]);
      expect(report.totals[0].damageDealt).toBe(20);
      expect(report.totals[1].damageDealt).toBe(6);
    });

    it("also reports the first KO and the side that carried its damage", () => {
      const [ko] = notesOf(report, "first-ko");
      expect(ko.text).toBe("Cy (Team B) was the first dog down — round 2, to Ace's bite.");
      const carried = notesOf(report, "carried");
      expect(carried).toHaveLength(1);
      expect(carried[0].text).toBe("Cy dealt 6 of Team B's 6 damage (100%).");
    });
  });
});

describe("summarizeBout: shared names", () => {
  const REX_A: Dog[] = [dog("Rex", "brute", 6, 4, 0, ["maul"]), dog("Pal", "mongrel", 0, 0, 0, ["cower"])];
  const REX_B: Dog[] = [dog("Rex", "grem", 0, 0, 0, ["snap"]), dog("Nipper", "grem", 0, 0, 0, ["snap"])];

  it("flags the readout as inexact but still credits each side correctly when the log allows", () => {
    const result = simulateBattle(REX_A, REX_B, 11);
    const report = summarizeBout(result, [REX_A, REX_B]);
    expect(report.exact).toBe(false);
    expect(report.totals[0].damageDealt).toBe(report.totals[1].damageTaken);
    expect(report.totals[1].damageDealt).toBe(report.totals[0].damageTaken);
    expect(report.dogs[1][0].downBy).toBe("Rex");
    expect(report.dogs[1][0].downRound).toBe(1);
    expect(report.dogs[0][0].kos).toBeGreaterThanOrEqual(1);
  });
});
