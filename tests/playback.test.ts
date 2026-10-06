import { describe, expect, it } from "vitest";
import { eventDelay, eventFeedback, parseDamage, findFighter } from "../src/playback";
import type { BattleEvent, Dog } from "../src/engine/battle";

const dog = (name: string): Dog => ({
  id: name, name, strain: "mongrel", grit: 1, fang: 1, flea: 1, biteOrder: [], scars: [],
});

const teams: [Dog[], Dog[]] = [[dog("A"), dog("B")], [dog("C")]];

describe("playback helpers", () => {
  it("findFighter locates by name and team", () => {
    expect(findFighter(teams, "C")).toEqual({ team: 1, slot: 0 });
    expect(findFighter(teams, "B")).toEqual({ team: 0, slot: 1 });
    expect(findFighter(teams, "Z")).toBeNull();
  });

  it("parseDamage extracts number after 'takes '", () => {
    expect(parseDamage("A takes 7.")).toBe(7);
    expect(parseDamage("no damage")).toBeNull();
  });

  it("eventFeedback classifies kinds and maps refs", () => {
    const hit: BattleEvent = { round: 1, kind: "hit", text: "C takes 4.", actor: "A", target: "C" };
    const fb = eventFeedback(hit, teams);
    expect(fb.kind).toBe("hit");
    expect(fb.damage).toBe(4);
    expect(fb.actor).toEqual({ team: 0, slot: 0 });
    expect(fb.target).toEqual({ team: 1, slot: 0 });

    const dodge: BattleEvent = { round: 1, kind: "status", text: "B plays dead — the hit whiffs." };
    expect(eventFeedback(dodge, teams).kind).toBe("dodge");

    const shield: BattleEvent = { round: 1, kind: "status", text: "C's shield eats 3." };
    expect(eventFeedback(shield, teams).kind).toBe("shield");
  });

  it("eventDelay uses kind-based cadence and round pauses", () => {
    const trick: BattleEvent = { round: 1, kind: "trick", text: "A plays Maul." };
    expect(eventDelay(null, trick)).toBe(480);
    const hit: BattleEvent = { round: 1, kind: "hit", text: "C takes 3." };
    expect(eventDelay(trick, hit)).toBe(220);
    const nextRound: BattleEvent = { round: 2, kind: "hit", text: "C takes 2." };
    expect(eventDelay(hit, nextRound)).toBe(220 + 520);
    expect(eventDelay(hit, null)).toBe(400);
  });
});
