/**
 * Ghost ladder difficulty — the Bone Bracket must push back.
 * Deterministic and seed-only: 40 seeded ghost leagues per pressure level,
 * the untouched starter trio (the exact builds a new player fields before the
 * Pound does anything) against every ghost lineup, bout seeds identical across
 * pressures so ghost strength is the only variable.
 *
 * Acceptance ladder: starter win rate 0.55-0.75 at pressure 0, falling
 * monotonically with pressure and at most 0.35 at pressure 6 (Crown Pit, late
 * seasons); no ghost personality is a free win (at most 0.85 each at pressure 0).
 */

import { describe, expect, it } from "vitest";
import { simulateBattle, type Dog } from "../src/engine/battle";
import { fnv1a } from "../src/engine/rng";
import { PERSONALITIES, makeGhostLeague, type Personality } from "../src/league/ghosts";
import { GHOST_COUNT } from "../src/league/season";

const LEAGUE_SEEDS: number[] = Array.from({ length: 40 }, (_, i) => (1000 + i * 7919) >>> 0);
const PRESSURES = [0, 1, 2, 3, 4, 5, 6];

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

/** Same bout seed at every pressure — ghost strength is the only variable. */
function boutSeed(leagueSeed: number, ghostIndex: number): number {
  return fnv1a(`ghost-ladder|${leagueSeed}|${ghostIndex}`);
}

interface LadderSample {
  bouts: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

const sampleCache = new Map<string, LadderSample>();

function playLadder(pressure: number, personality?: Personality): LadderSample {
  const cacheKey = `${pressure}|${personality ?? "all"}`;
  const cached = sampleCache.get(cacheKey);
  if (cached) return cached;

  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const leagueSeed of LEAGUE_SEEDS) {
    const ghosts = makeGhostLeague(leagueSeed, GHOST_COUNT, pressure);
    ghosts.forEach((ghost, ghostIndex) => {
      if (personality && ghost.personality !== personality) return;
      const result = simulateBattle(
        cloneDogs(starterTrio()),
        cloneDogs(ghost.kennel.dogs.slice(0, 3)),
        boutSeed(leagueSeed, ghostIndex),
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
  it("is deterministic — two identical runs measure the same ladder", () => {
    expect(playLadder(0)).toEqual(playLadder(0));
    expect(playLadder(6)).toEqual(playLadder(6));
  });

  it("starter trio at pressure 0 wins 0.55-0.75 — winnable with attention, losses happen", () => {
    const sample = playLadder(0);
    expect(sample.bouts).toBeGreaterThanOrEqual(240);
    expect(
      sample.winRate,
      `pressure 0 winRate ${sample.winRate.toFixed(3)} (${sample.wins}W/${sample.draws}D/${sample.losses}L)`,
    ).toBeGreaterThanOrEqual(0.55);
    expect(
      sample.winRate,
      `pressure 0 winRate ${sample.winRate.toFixed(3)} (${sample.wins}W/${sample.draws}D/${sample.losses}L)`,
    ).toBeLessThanOrEqual(0.75);
    expect(sample.losses, "the starter trio must actually drop bouts at pressure 0").toBeGreaterThan(0);
  });

  it("the ladder climbs: win rate falls monotonically and is at most 0.35 at pressure 6", () => {
    const curve = PRESSURES.map((p) => playLadder(p).winRate);
    for (let i = 1; i < curve.length; i++) {
      expect(
        curve[i],
        `pressure ${PRESSURES[i]} (${curve[i].toFixed(3)}) must not out-score pressure ${PRESSURES[i - 1]} (${curve[i - 1].toFixed(3)})`,
      ).toBeLessThanOrEqual(curve[i - 1]);
    }
    expect(
      curve[6],
      `pressure 6 winRate ${curve[6].toFixed(3)} — Crown Pit must beat the untouched starter trio`,
    ).toBeLessThanOrEqual(0.35);
  });

  it("no ghost personality is a free win at pressure 0 (each at most 0.85)", () => {
    for (const personality of PERSONALITIES) {
      const sample = playLadder(0, personality);
      expect(sample.bouts, `${personality} fielded no bouts`).toBeGreaterThan(0);
      expect(
        sample.winRate,
        `${personality} winRate ${sample.winRate.toFixed(3)}`,
      ).toBeLessThanOrEqual(0.85);
    }
  });
});
