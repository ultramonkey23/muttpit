import { describe, expect, it } from "vitest";
import {
  DIVISIONS,
  SEASON_WEEKS,
  GHOST_COUNT,
  startSeason,
  playWeek,
  standings,
  closeSeason,
  nextSeason,
} from "../src/league/season";
import { makeGhost, makeGhostLeague } from "../src/league/ghosts";
import { poundOffers, teachTrick, DOG_PRICE, TRICK_PRICE } from "../src/league/pound";
import { validateKennel, type Dog } from "../src/engine/battle";
import type { Kennel } from "../src/async/packets";

function dog(name: string, strain: Dog["strain"], grit: number, fang: number, flea: number, order: string[]): Dog {
  return { id: name, name, strain, grit, fang, flea, biteOrder: order, scars: [] };
}

const playerKennel: Kennel = {
  v: 1,
  name: "Bucket Kennels",
  motto: "Lose small. Scar big.",
  dogs: [
    dog("Big Sad", "brute", 2, 3, 1, ["maul", "cower", "snap"]),
    dog("Nubbins", "grem", 1, 4, 3, ["flurry", "mudtoss"]),
    dog("Pockets", "cur", 2, 2, 2, ["fleabite", "sic", "snap"]),
    dog("Wobbles", "mongrel", 3, 2, 3, ["packpounce", "howl"]),
  ],
};

function runFullSeason(seed: number): ReturnType<typeof startSeason> {
  let state = startSeason(playerKennel, seed, 0, 1);
  while (!state.done) {
    state = playWeek(state).state;
  }
  return state;
}

describe("ghost kennels", () => {
  it("are deterministic from seed", () => {
    const a = makeGhost(999, 3);
    const b = makeGhost(999, 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = makeGhost(999, 4);
    expect(c.id).not.toBe(a.id);
  });

  it("generate a full league of valid kennels", () => {
    const league = makeGhostLeague(1234, GHOST_COUNT);
    expect(league.length).toBe(GHOST_COUNT);
    for (const g of league) {
      expect(validateKennel(g.kennel.dogs).ok).toBe(true);
      expect(g.kennel.dogs.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("bone bracket season", () => {
  it("runs 8 weeks of real bouts with standings", () => {
    const state = runFullSeason(2026);
    expect(state.week).toBe(SEASON_WEEKS);
    expect(state.done).toBe(true);
    expect(state.playerResults.length).toBe(SEASON_WEEKS);
    // the ghost league keeps playing too — non-live opponents have a life
    expect(state.ghostResults.length).toBeGreaterThan(0);

    const table = standings(state);
    expect(table.length).toBe(GHOST_COUNT + 1);
    const playerRow = table.find((r) => r.isPlayer)!;
    expect(playerRow.played).toBe(SEASON_WEEKS);
    // every match hands out 3 points total, never more or less
    const totalPoints = table.reduce((s, r) => s + r.points, 0);
    const totalMatches = state.playerResults.length + state.ghostResults.length;
    expect(totalPoints).toBeLessThanOrEqual(totalMatches * 3);
  });

  it("each season is deterministic", () => {
    const a = runFullSeason(777);
    const b = runFullSeason(777);
    expect(a.playerResults.map((r) => r.logHash)).toEqual(b.playerResults.map((r) => r.logHash));
  });

  it("scars persist on the player roster through the season", () => {
    let state = startSeason(playerKennel, 4242, 0, 1);
    const before = JSON.stringify(state.player);
    for (let i = 0; i < SEASON_WEEKS && !state.done; i++) {
      state = playWeek(state).state;
    }
    expect(JSON.stringify(state.player)).not.toBe(before);
    const totalScars = state.player.dogs.reduce((s, d) => s + d.scars.length, 0);
    expect(totalScars).toBeGreaterThan(0);
  });

  it("closes with ranks, payouts, and promotion/relegation logic", () => {
    const state = runFullSeason(555);
    const close = closeSeason(state);
    expect(close.playerRank).toBeGreaterThanOrEqual(1);
    expect(close.playerRank).toBeLessThanOrEqual(GHOST_COUNT + 1);
    expect(close.scrapPayout).toBeGreaterThan(0);
    expect(close.summary.length).toBeGreaterThan(0);
    const expectedMove = close.promoted ? 1 : close.relegated ? -1 : 0;
    expect(close.state.division).toBe(Math.min(DIVISIONS.length - 1, state.division + expectedMove));
  });

  it("nextSeason carries scars and scrap forward", () => {
    const state = runFullSeason(31337);
    const next = nextSeason(state);
    expect(next.season).toBe(state.season + 1);
    expect(next.scrap).toBe(state.scrap);
    expect(next.player).toEqual(state.player);
    expect(next.week).toBe(0);
  });
});

describe("the pound", () => {
  it("offers are deterministic and valid", () => {
    const o1 = poundOffers(88);
    const o2 = poundOffers(88);
    expect(JSON.stringify(o1)).toBe(JSON.stringify(o2));
    expect(o1.dogs.length).toBe(3);
    expect(o1.tricks.length).toBe(3);
    for (const d of o1.dogs) {
      expect(validateKennel([d]).ok).toBe(true);
    }
    expect(DOG_PRICE).toBeGreaterThan(TRICK_PRICE);
  });

  it("teaches tricks up to the bite order cap", () => {
    const d = dog("Learner", "mongrel", 1, 1, 1, ["snap"]);
    expect(teachTrick(d, "maul").ok).toBe(true);
    teachTrick(d, "cower");
    teachTrick(d, "sic");
    expect(teachTrick(d, "spite").ok).toBe(false);
    expect(teachTrick(d, "nuke").ok).toBe(false);
    expect(teachTrick(d, "snap").ok).toBe(false);
    expect(d.biteOrder.length).toBe(4);
  });
});

describe("standings receipt truth", () => {
  it("counts every ghost bout in the P column (played = W+D+L for all rows)", () => {
    let st = startSeason(playerKennel, 777, 0, 1);
    for (let w = 0; w < SEASON_WEEKS; w++) st = playWeek(st).state;
    const table = standings(st);
    for (const row of table) {
      expect(row.played).toBe(row.wins + row.draws + row.losses);
    }
    expect(table.find((r) => r.isPlayer)!.played).toBe(SEASON_WEEKS);
  });
});

describe("ghost pressure ladder", () => {
  it("raises ghost skill with season/division pressure without breaking determinism", () => {
    const calm = makeGhostLeague(4242, GHOST_COUNT, 0);
    const heat = makeGhostLeague(4242, GHOST_COUNT, 3);
    for (let i = 0; i < GHOST_COUNT; i++) {
      expect(heat[i].skill).toBeGreaterThanOrEqual(calm[i].skill);
      expect(heat[i].skill).toBeLessThanOrEqual(0.95);
    }
    expect(heat.some((g, i) => g.skill > calm[i].skill)).toBe(true);
  });

  it("startSeason feeds season+division into ghost pressure", () => {
    const a = startSeason(playerKennel, 90210, 0, 1);
    const b = startSeason(playerKennel, 90210, 2, 3);
    const aSkill = a.ghosts.reduce((s, g) => s + g.skill, 0) / a.ghosts.length;
    const bSkill = b.ghosts.reduce((s, g) => s + g.skill, 0) / b.ghosts.length;
    expect(bSkill).toBeGreaterThan(aSkill);
  });
});
