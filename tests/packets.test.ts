import { describe, expect, it } from "vitest";
import {
  auditPacket,
  decodeKennel,
  decodePacket,
  encodeKennel,
  encodePacket,
  resolveBout,
  type Kennel,
} from "../src/async/packets";
import type { Dog } from "../src/engine/battle";

function dog(name: string, strain: Dog["strain"], grit: number, fang: number, flea: number, order: string[]): Dog {
  return { id: name, name, strain, grit, fang, flea, biteOrder: order, scars: [] };
}

const kennelA: Kennel = {
  v: 1,
  name: "The Rust Yard",
  motto: "Bite first. File later.",
  dogs: [
    dog("Big Sad", "brute", 2, 3, 1, ["maul", "cower", "snap"]),
    dog("Nubbins", "grem", 1, 4, 3, ["flurry", "mudtoss"]),
    dog("Pockets", "cur", 2, 2, 2, ["fleabite", "sic", "snap"]),
  ],
};

const kennelB: Kennel = {
  v: 1,
  name: "Sewer Saints",
  motto: "We keep the receipts.",
  dogs: [
    dog("Duchess", "bonehound", 3, 2, 2, ["boneshield", "snap", "maul"]),
    dog("Teeth", "pupp", 1, 3, 5, ["backbite", "playdead", "flurry"]),
    dog("Gasket", "mongrel", 3, 2, 3, ["packpounce", "howl", "snap"]),
  ],
};

describe("kennel codes", () => {
  it("round-trips a kennel", () => {
    const code = encodeKennel(kennelA);
    const back = decodeKennel(code);
    expect(back.ok).toBe(true);
    expect(back.kennel?.name).toBe("The Rust Yard");
    expect(back.kennel?.dogs.length).toBe(3);
  });

  it("handles unicode names", () => {
    const k: Kennel = { ...kennelA, name: "Кусаки 犬", motto: "¡Ay!" };
    const back = decodeKennel(encodeKennel(k));
    expect(back.kennel?.name).toBe("Кусаки 犬");
  });

  it("rejects tampered codes", () => {
    const code = encodeKennel(kennelA);
    const tampered = code.slice(0, code.length - 2) + (code.endsWith("AA") ? "BB" : "AA");
    expect(decodeKennel(tampered).ok).toBe(false);
  });

  it("rejects garbage", () => {
    expect(decodeKennel("not-a-code").ok).toBe(false);
  });

  it("refuses to encode an invalid kennel", () => {
    const bad: Kennel = { ...kennelA, dogs: [dog("Bad", "mongrel", 1, 1, 1, ["nuke"])] };
    expect(() => encodeKennel(bad)).toThrow();
  });
});

describe("verdict packets (the Pit keeps the receipts)", () => {
  it("resolves a bout and the packet audits clean", () => {
    const { packet, result } = resolveBout(kennelA, kennelB, 42);
    const code = encodePacket(packet);
    const audit = auditPacket(code);
    expect(audit.ok).toBe(true);
    expect(audit.replayedHash).toBe(result.logHash);
  });

  it("is reproducible: same kennels + seed = same verdict", () => {
    const one = resolveBout(kennelA, kennelB, 42);
    const two = resolveBout(kennelA, kennelB, 42);
    expect(one.packet.logHash).toBe(two.packet.logHash);
    expect(one.packet.winner).toBe(two.packet.winner);
  });

  it("detects a forged log hash", () => {
    const { packet } = resolveBout(kennelA, kennelB, 42);
    const forged = { ...packet, logHash: "deadbeef" };
    const audit = auditPacket(encodePacket(forged));
    expect(audit.ok).toBe(false);
    expect(audit.error).toContain("mismatch");
  });

  it("detects a tampered payload", () => {
    const code = encodePacket(resolveBout(kennelA, kennelB, 42).packet);
    const tampered = code.slice(0, 5) + (code[5] === "A" ? "B" : "A") + code.slice(6);
    const decoded = decodePacket(tampered);
    expect(decoded.ok).toBe(false);
  });
});
