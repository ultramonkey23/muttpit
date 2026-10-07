import { describe, expect, it } from "vitest";
import { GHOST_COUNT } from "../src/league/season";
import { makeGhostLeague } from "../src/league/ghosts";

function norm(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

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

  it("never shares the player's starter kennel name (case/whitespace-insensitive)", () => {
    const seeds = [0, 1, 7, 42, 999, 2026, 0x7fffffff, 0xffffffff];
    const pressures = [0, 1, 4, 12];
    const playerName = "Bucket Kennels";

    for (const seed of seeds) {
      for (const pressure of pressures) {
        const ghosts = makeGhostLeague(seed, GHOST_COUNT, pressure, playerName);
        const names = ghosts.map((g) => g.kennel.name);
        expect(new Set(names).size).toBe(ghosts.length);
        for (const name of names) {
          expect(norm(name)).not.toBe(norm(playerName));
        }
        for (const ghost of ghosts) {
          expect(ghost.name).toBe(ghost.kennel.name);
        }
      }
    }
  });

  it("stays distinct from a renamed player kennel including odd case/whitespace", () => {
    const seeds = [3, 88, 4242, 90210, 31337];
    const pressures = [0, 2, 8];
    const renames = ["My Rowdy Pit", "  my   ROWDY   pit ", "BUCKET KENNELS", "bucket\tkennels"];

    for (const seed of seeds) {
      for (const pressure of pressures) {
        for (const playerName of renames) {
          const ghosts = makeGhostLeague(seed, GHOST_COUNT, pressure, playerName);
          const names = ghosts.map((g) => g.kennel.name);
          expect(new Set(names).size).toBe(ghosts.length);
          for (const name of names) {
            expect(norm(name)).not.toBe(norm(playerName));
          }
          for (const ghost of ghosts) {
            expect(ghost.name).toBe(ghost.kennel.name);
          }
        }
      }
    }
  });

  it("is deterministic for the same season seed, pressure, and player name", () => {
    for (const seed of [3, 88, 4242, 90210, 31337]) {
      for (const pressure of [0, 2, 8]) {
        for (const playerName of ["Bucket Kennels", "My Rowdy Pit", "  bucket   kennels "]) {
          const first = makeGhostLeague(seed, GHOST_COUNT, pressure, playerName);
          const second = makeGhostLeague(seed, GHOST_COUNT, pressure, playerName);
          expect(second).toEqual(first);
        }
      }
    }
  });

  it("never equals or starts with the player's name across many seeds and renames", () => {
    const seeds = [0, 1, 7, 42, 999, 2026, 0x7fffffff, 0xffffffff, 3, 88, 4242, 90210, 31337];
    const pressures = [0, 1, 2, 4, 8, 12];
    const renames = [
      "Bucket Kennels",
      "BUCKET KENNELS",
      "bucket\tkennels",
      "  bucket   kennels ",
      "My Rowdy Pit",
      "  my   ROWDY   pit ",
      "The",
      "the rust",
      "Bucket",
    ];

    for (const seed of seeds) {
      for (const pressure of pressures) {
        for (const playerName of renames) {
          const ghosts = makeGhostLeague(seed, GHOST_COUNT, pressure, playerName);
          const names = ghosts.map((g) => g.kennel.name);
          expect(new Set(names).size).toBe(ghosts.length);
          for (const name of names) {
            const n = norm(name);
            const p = norm(playerName);
            expect(n).not.toBe(p);
            expect(n.startsWith(p)).toBe(false);
          }
          for (const ghost of ghosts) {
            expect(ghost.name).toBe(ghost.kennel.name);
          }
          const again = makeGhostLeague(seed, GHOST_COUNT, pressure, playerName);
          expect(again).toEqual(ghosts);
        }
      }
    }
  });
});
