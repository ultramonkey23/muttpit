import { describe, expect, it } from "vitest";
import { moveTrick, removeTrick } from "../src/league/pound";
import type { Dog } from "../src/engine/battle";

function mkDog(order: string[]): Dog {
  return {
    id: "test",
    name: "Test",
    strain: "mongrel",
    grit: 2,
    fang: 2,
    flea: 2,
    biteOrder: order,
    scars: [],
  };
}

describe("moveTrick", () => {
  it("swaps with the next entry when direction is down", () => {
    const d = mkDog(["a", "b", "c"]);
    const res = moveTrick(d, 0, "down");
    expect(res).toEqual({ ok: true });
    expect(d.biteOrder).toEqual(["b", "a", "c"]);
  });

  it("swaps with the previous entry when direction is up", () => {
    const d = mkDog(["a", "b", "c"]);
    const res = moveTrick(d, 2, "up");
    expect(res).toEqual({ ok: true });
    expect(d.biteOrder).toEqual(["a", "c", "b"]);
  });

  it("refuses to move past the top of the order", () => {
    const d = mkDog(["a", "b"]);
    const res = moveTrick(d, 0, "up");
    expect(res.ok).toBe(false);
    expect(d.biteOrder).toEqual(["a", "b"]);
  });

  it("refuses to move past the bottom of the order", () => {
    const d = mkDog(["a", "b"]);
    const res = moveTrick(d, 1, "down");
    expect(res.ok).toBe(false);
    expect(d.biteOrder).toEqual(["a", "b"]);
  });

  it("refuses an out-of-range index without mutating", () => {
    const d = mkDog(["a", "b"]);
    expect(moveTrick(d, -1, "up").ok).toBe(false);
    expect(moveTrick(d, 5, "down").ok).toBe(false);
    expect(d.biteOrder).toEqual(["a", "b"]);
  });
});

describe("removeTrick", () => {
  it("removes a trick from the middle of the order", () => {
    const d = mkDog(["a", "b", "c"]);
    const res = removeTrick(d, 1);
    expect(res).toEqual({ ok: true });
    expect(d.biteOrder).toEqual(["a", "c"]);
  });

  it("removes the last trick too", () => {
    const d = mkDog(["a", "b"]);
    const res = removeTrick(d, 1);
    expect(res).toEqual({ ok: true });
    expect(d.biteOrder).toEqual(["a"]);
  });

  it("refuses to leave the bite order empty", () => {
    const d = mkDog(["a"]);
    const res = removeTrick(d, 0);
    expect(res.ok).toBe(false);
    expect(d.biteOrder).toEqual(["a"]);
  });

  it("refuses an out-of-range index without mutating", () => {
    const d = mkDog(["a", "b"]);
    expect(removeTrick(d, -1).ok).toBe(false);
    expect(removeTrick(d, 2).ok).toBe(false);
    expect(d.biteOrder).toEqual(["a", "b"]);
  });
});
