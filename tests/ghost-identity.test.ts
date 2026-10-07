import { describe, expect, it } from "vitest";
import { GHOST_COUNT } from "../src/league/season";
import { makeGhostLeague } from "../src/league/ghosts";

describe("ghost kennel identity", () => {
  it("keeps every season rival distinct and uses one name across its records", () => {
    const seeds = [0, 1, 7, 42, 999, 2026, 0x7fffffff, 0xffffffff];
    const pressures = [0, 1, 4, 12];

    for (const seed of seeds) {
      for (const pressure of pressures) {
        const ghosts = makeGhostLeague(seed, GHOST_COUNT, pressure);
        const names = ghosts.map((ghost) => ghost.kennel.name);

        expect(new Set(names).size).toBe(ghosts.length);
        for (const ghost of ghosts) {
          expect(ghost.name).toBe(ghost.kennel.name);
        }
      }
    }
  });

  it("is deterministic for the same season seed and pressure", () => {
    for (const seed of [3, 88, 4242, 90210, 31337]) {
      for (const pressure of [0, 2, 8]) {
        const first = makeGhostLeague(seed, GHOST_COUNT, pressure);
        const second = makeGhostLeague(seed, GHOST_COUNT, pressure);
        expect(second).toEqual(first);
      }
    }
  });
});
