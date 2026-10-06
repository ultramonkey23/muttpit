import { describe, expect, it } from "vitest";
import { TRICK_IDS } from "../src/engine/content";
import { buildArchetypes, runBalanceReport } from "../src/league/balance";

describe("balance harness", () => {
  it("is deterministic — two runs equal", () => {
    expect(runBalanceReport()).toEqual(runBalanceReport());
  });

  it("runs at least 120 round-robin bouts over the reported seeds", () => {
    const report = runBalanceReport();
    expect(report.bouts).toBeGreaterThanOrEqual(120);
    expect(report.seeds.length).toBeGreaterThan(0);
    for (const outcome of report.archetypes) {
      expect(outcome.bouts).toBeGreaterThan(0);
    }
  });

  it("keeps every strain archetype win rate within 0.25-0.75 vs the field", () => {
    const report = runBalanceReport();
    const strains = report.archetypes.filter((a) => a.kind === "strain");
    expect(strains.length).toBeGreaterThan(0);
    for (const outcome of strains) {
      expect(
        outcome.winRate,
        `${outcome.id} winRate ${outcome.winRate.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(0.25);
      expect(
        outcome.winRate,
        `${outcome.id} winRate ${outcome.winRate.toFixed(3)}`,
      ).toBeLessThanOrEqual(0.75);
    }
  });


  it("keeps every personality archetype win rate within 0.25-0.75 vs the field", () => {
    const report = runBalanceReport();
    const personalities = report.archetypes.filter((a) => a.kind === "personality");
    expect(personalities.length).toBeGreaterThan(0);
    for (const outcome of personalities) {
      expect(
        outcome.winRate,
        `${outcome.id} winRate ${outcome.winRate.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(0.25);
      expect(
        outcome.winRate,
        `${outcome.id} winRate ${outcome.winRate.toFixed(3)}`,
      ).toBeLessThanOrEqual(0.75);
    }
  });
  it("keeps every strain win rate within 0.25-0.75 vs the isolated strain field", () => {
    const report = runBalanceReport();
    const strains = report.archetypes.filter((a) => a.kind === "strain" && a.strainField);
    expect(strains.length).toBeGreaterThan(0);
    for (const outcome of strains) {
      const rate = outcome.strainField!.winRate;
      expect(
        rate,
        `${outcome.id} strainField winRate ${rate.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(0.25);
      expect(
        rate,
        `${outcome.id} strainField winRate ${rate.toFixed(3)}`,
      ).toBeLessThanOrEqual(0.75);
    }
  });

  it("plays every trick id in at least one archetype bite order", () => {
    const played = new Set<string>();
    for (const archetype of buildArchetypes()) {
      for (const dog of archetype.dogs) {
        for (const trick of dog.biteOrder) played.add(trick);
      }
    }
    for (const trickId of TRICK_IDS) {
      expect(played.has(trickId), `trick ${trickId} never appears in a bite order`).toBe(true);
    }
  });
});
