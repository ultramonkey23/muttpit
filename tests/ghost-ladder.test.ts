/**
 * Ghost ladder difficulty — the Bone Bracket must push back.
 * Deterministic and seed-only: seeded ghost leagues per pressure level, the
 * untouched starter trio (the exact builds a new player fields before the Pound
 * does anything) against every ghost lineup, bout seeds identical across
 * pressures so ghost strength is the only variable.
 *
 * Two independent seed families are encoded (A: 40 leagues 1000+i*7919; B: 60
 * leagues s*104729+17 with bout seed s*977+n). Every assertion below is re-run
 * against both families.
 *
 * Acceptance ladder on BOTH families: starter win rate 0.55-0.75 at pressure 0,
 * every personality 0.25-0.80 (aggressive the hardest), the curve falling
 * monotonically with pressure and at most 0.35 at pressure 6 (Crown Pit, late
 * seasons); no ghost personality is a free win (at most 0.85 each at pressure 0).
 */

import { describe, expect, it } from "vitest";
import { simulateBattle, type Dog } from "../src/engine/battle";
import { fnv1a } from "../src/engine/rng";
import { PERSONALITIES, makeGhostLeague, type Personality } from "../src/league/ghosts";
import { GHOST_COUNT } from "../src/league/season";

/** Seed family A — the original 40-league ladder used when this test was first written. */
const LEAGUE_SEEDS_A: number[] = Array.from({ length: 40 }, (_, i) => (1000 + i * 7919) >>> 0);
/** Seed family B — an independent 60-league family (league s*104729+17, bout s*977+n) used at integration review. */
const LEAGUE_SEEDS_B: number[] = Array.from({ length: 60 }, (_, s) => (s * 104729 + 17) >>> 0);
const PRESSURES = [0, 1, 2, 3, 4, 5, 6];

interface Family {
  name: string;
  leagueSeeds: number[];
  boutSeed: (leagueSeed: number, ghostIndex: number) => number;
}

const FAMILIES: Family[] = [
  {
    name: "A",
    leagueSeeds: LEAGUE_SEEDS_A,
    boutSeed: (leagueSeed, ghostIndex) => fnv1a(`ghost-ladder|${leagueSeed}|${ghostIndex}`),
  },
  {
    name: "B",
    leagueSeeds: LEAGUE_SEEDS_B,
    boutSeed: (leagueSeed, ghostIndex) => (leagueSeed * 977 + ghostIndex) >>> 0,
  },
];

/** The untouched starter trio — Big Sad, Nubbins, Pockets. */
function starterTrio(): Dog[] {
  return [
    {
      id: "starter-big-sad",
      name: "Big Sad",
      strain: "brute",
      grit: 2,
      fang: 3,
      flea: 1,
      biteOrder: ["maul", "cower", "snap"],
      scars: [],
    },
    {
      id: "starter-nubbins",
      name: "Nubbins",
      strain: "grem",
      grit: 1,
      fang: 4,
      flea: 3,
      biteOrder: ["flurry", "mudtoss"],
      scars: [],
    },
    {
      id: "starter-pockets",
      name: "Pockets",
      strain: "cur",
      grit: 2,
      fang: 2,
      flea: 2,
      biteOrder: ["fleabite", "sic", "snap"],
      scars: [],
    },
  ];
}

/** Bout bodies are re-built per fight so no bout can leak state into the next. */
function cloneDogs(dogs: Dog[]): Dog[] {
  return dogs.map((d) => ({
    ...d,
    biteOrder: [...d.biteOrder],
    scars: d.scars.map((s) => ({ ...s })),
  }));
}

// Bout seeds are per-family (see FAMILIES above) so ghost strength stays the only variable across pressures.

interface LadderSample {
  bouts: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

const sampleCache = new Map<string, LadderSample>();

function playLadder(family: Family, pressure: number, personality?: Personality): LadderSample {
  const cacheKey = `${family.name}|${pressure}|${personality ?? "all"}`;
  const cached = sampleCache.get(cacheKey);
  if (cached) return cached;

  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const leagueSeed of family.leagueSeeds) {
    const ghosts = makeGhostLeague(leagueSeed, GHOST_COUNT, pressure);
    ghosts.forEach((ghost, ghostIndex) => {
      if (personality && ghost.personality !== personality) return;
      const result = simulateBattle(
        cloneDogs(starterTrio()),
        cloneDogs(ghost.kennel.dogs.slice(0, 3)),
        family.boutSeed(leagueSeed, ghostIndex),
      );
      if (result.winner === 0) wins += 1;
      else if (result.winner === 1) losses += 1;
      else draws += 1;
    });
  }
  const bouts = wins + draws + losses;
  const sample: LadderSample = {
    bouts,
    wins,
    draws,
    losses,
    winRate: bouts > 0 ? (wins + 0.5 * draws) / bouts : 0,
  };
  sampleCache.set(cacheKey, sample);
  return sample;
}

describe("ghost ladder difficulty", () => {
  for (const family of FAMILIES) {
    describe(`seed family ${family.name} (${family.leagueSeeds.length} leagues)`, () => {
      it("is deterministic — two identical runs measure the same ladder", () => {
        expect(playLadder(family, 0)).toEqual(playLadder(family, 0));
        expect(playLadder(family, 6)).toEqual(playLadder(family, 6));
      });

      it("starter trio at pressure 0 wins 0.55-0.75 — winnable with attention, losses happen", () => {
        const sample = playLadder(family, 0);
        expect(sample.bouts).toBeGreaterThanOrEqual(240);
        expect(
          sample.winRate,
          `family ${family.name} pressure 0 winRate ${sample.winRate.toFixed(3)} (${sample.wins}W/${sample.draws}D/${sample.losses}L)`,
        ).toBeGreaterThanOrEqual(0.55);
        expect(
          sample.winRate,
          `family ${family.name} pressure 0 winRate ${sample.winRate.toFixed(3)} (${sample.wins}W/${sample.draws}D/${sample.losses}L)`,
        ).toBeLessThanOrEqual(0.75);
        expect(sample.losses, "the starter trio must actually drop bouts at pressure 0").toBeGreaterThan(0);
      });

      it("the ladder climbs: win rate falls monotonically and is at most 0.35 at pressure 6", () => {
        const curve = PRESSURES.map((p) => playLadder(family, p).winRate);
        for (let i = 1; i < curve.length; i++) {
          expect(
            curve[i],
            `family ${family.name} pressure ${PRESSURES[i]} (${curve[i].toFixed(3)}) must not out-score pressure ${PRESSURES[i - 1]} (${curve[i - 1].toFixed(3)})`,
          ).toBeLessThanOrEqual(curve[i - 1]);
        }
        expect(
          curve[6],
          `family ${family.name} pressure 6 winRate ${curve[6].toFixed(3)} — Crown Pit must beat the untouched starter trio`,
        ).toBeLessThanOrEqual(0.35);
      });

      it("per-personality floor at pressure 0: every personality 0.25-0.80, aggressive hardest", () => {
        const rates = new Map<Personality, number>();
        for (const personality of PERSONALITIES) {
          const sample = playLadder(family, 0, personality);
          expect(sample.bouts, `${family.name} ${personality} fielded no bouts`).toBeGreaterThan(0);
          expect(
            sample.winRate,
            `family ${family.name} ${personality} winRate ${sample.winRate.toFixed(3)} below 0.25 floor`,
          ).toBeGreaterThanOrEqual(0.25);
          expect(
            sample.winRate,
            `family ${family.name} ${personality} winRate ${sample.winRate.toFixed(3)} above 0.80 cap`,
          ).toBeLessThanOrEqual(0.80);
          rates.set(personality, sample.winRate);
        }
        const agg = rates.get("aggressive")!;
        for (const personality of PERSONALITIES) {
          if (personality === "aggressive") continue;
          expect(
            agg,
            `family ${family.name}: aggressive (${agg.toFixed(3)}) must be the hardest matchup, but ${personality} (${rates.get(personality)!.toFixed(3)}) is lower`,
          ).toBeLessThanOrEqual(rates.get(personality)!);
        }
      });

      it("no ghost personality is a free win at pressure 0 (each at most 0.85)", () => {
        for (const personality of PERSONALITIES) {
          const sample = playLadder(family, 0, personality);
          expect(sample.bouts, `${family.name} ${personality} fielded no bouts`).toBeGreaterThan(0);
          expect(
            sample.winRate,
            `family ${family.name} ${personality} winRate ${sample.winRate.toFixed(3)}`,
          ).toBeLessThanOrEqual(0.85);
        }
      });
    });
  }
});
