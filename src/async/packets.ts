/**
 * Async PvP truth: Kennel Codes and Verdict Packets.
 * Play-by-mail for the modern age: no server, no lies — a packet replays identically anywhere.
 */

import { fnv1a } from "../engine/rng";
import { simulateBattle, validateKennel, type Dog, type BattleResult } from "../engine/battle";

export interface Kennel {
  v: 1;
  name: string;
  motto: string;
  dogs: Dog[];
}

export interface VerdictPacket {
  v: 1;
  seed: number;
  a: string; // kennel code of team A
  b: string; // kennel code of team B
  winner: 0 | 1 | -1;
  rounds: number;
  logHash: string;
  summary: string;
}

// ---- portable base64url (utf-8 safe, no btoa/Buffer dependency) ----

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToB64(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64[b2 & 63];
  }
  return out;
}

function b64ToBytes(text: string): number[] {
  const clean = text.replace(/[^A-Za-z0-9\-_]/g, "");
  const rev = new Map<string, number>();
  for (let i = 0; i < B64.length; i++) rev.set(B64[i], i);
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = rev.get(clean[i]) ?? 0;
    const c1 = rev.get(clean[i + 1]) ?? 0;
    const c2 = i + 2 < clean.length ? rev.get(clean[i + 2]) : undefined;
    const c3 = i + 3 < clean.length ? rev.get(clean[i + 3]) : undefined;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 === undefined) break;
    bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 === undefined) break;
    bytes.push(((c2 & 3) << 6) | c3);
  }
  return bytes;
}

export function encodeString(text: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
  }
  return bytesToB64(bytes);
}

export function decodeString(text: string): string {
  const bytes = b64ToBytes(text);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b < 0xe0) {
      out += String.fromCharCode(((b & 31) << 6) | (bytes[++i] & 63));
    } else {
      out += String.fromCharCode(((b & 15) << 12) | ((bytes[++i] & 63) << 6) | (bytes[++i] & 63));
    }
  }
  return out;
}

function seal(payload: string): string {
  return `${payload}.${fnv1a(payload).toString(16)}`;
}

function unseal(text: string): { ok: boolean; payload: string } {
  const dot = text.lastIndexOf(".");
  if (dot < 0) return { ok: false, payload: "" };
  const payload = text.slice(0, dot);
  const claimed = text.slice(dot + 1);
  return { ok: fnv1a(payload).toString(16) === claimed, payload };
}

// ---- kennel codes ----

export function encodeKennel(kennel: Kennel): string {
  const check = validateKennel(kennel.dogs);
  if (!check.ok) throw new Error(`refusing to encode invalid kennel: ${check.errors.join("; ")}`);
  return encodeString(seal(JSON.stringify(kennel)));
}

export function decodeKennel(code: string): { ok: boolean; kennel?: Kennel; error?: string } {
  try {
    const { ok, payload } = unseal(decodeString(code.trim()));
    if (!ok) return { ok: false, error: "checksum failed — the Pit does not accept tampered codes" };
    const kennel = JSON.parse(payload) as Kennel;
    if (kennel.v !== 1) return { ok: false, error: "unknown code version" };
    const check = validateKennel(kennel.dogs);
    if (!check.ok) return { ok: false, error: check.errors.join("; ") };
    return { ok: true, kennel };
  } catch {
    return { ok: false, error: "not a kennel code" };
  }
}

// ---- bouts + verdict packets ----

export function seedFor(codeA: string, codeB: string, seed: number): number {
  return fnv1a(`${codeA}|${codeB}|${seed}`);
}

export function resolveBout(
  kennelA: Kennel,
  kennelB: Kennel,
  seed: number,
): { result: BattleResult; packet: VerdictPacket; codeA: string; codeB: string } {
  const codeA = encodeKennel(kennelA);
  const codeB = encodeKennel(kennelB);
  const merged = seedFor(codeA, codeB, seed);
  const result = simulateBattle(kennelA.dogs, kennelB.dogs, merged);
  const summary = `${kennelA.name} vs ${kennelB.name}: ${
    result.winner === -1 ? "draw" : result.winner === 0 ? kennelA.name : kennelB.name
  } in ${result.rounds} rounds (${result.logHash})`;
  const packet: VerdictPacket = {
    v: 1,
    seed: merged,
    a: codeA,
    b: codeB,
    winner: result.winner,
    rounds: result.rounds,
    logHash: result.logHash,
    summary,
  };
  return { result, packet, codeA, codeB };
}

export function encodePacket(packet: VerdictPacket): string {
  return encodeString(seal(JSON.stringify(packet)));
}

export function decodePacket(text: string): { ok: boolean; packet?: VerdictPacket; error?: string } {
  try {
    const { ok, payload } = unseal(decodeString(text.trim()));
    if (!ok) return { ok: false, error: "checksum failed — forged verdicts smell like that" };
    const packet = JSON.parse(payload) as VerdictPacket;
    if (packet.v !== 1) return { ok: false, error: "unknown packet version" };
    return { ok: true, packet };
  } catch {
    return { ok: false, error: "not a verdict packet" };
  }
}

/** Re-derive a packet from its own claims. The Pit keeps the receipts. */
export function auditPacket(text: string): {
  ok: boolean;
  verdict?: VerdictPacket;
  replayedHash?: string;
  error?: string;
} {
  const decoded = decodePacket(text);
  if (!decoded.ok || !decoded.packet) return { ok: false, error: decoded.error };
  const p = decoded.packet;
  const a = decodeKennel(p.a);
  const b = decodeKennel(p.b);
  if (!a.ok || !a.kennel || !b.ok || !b.kennel) {
    return { ok: false, error: "packet references a kennel that will not decode" };
  }
  const result = simulateBattle(a.kennel.dogs, b.kennel.dogs, p.seed);
  if (result.logHash !== p.logHash) {
    return {
      ok: false,
      error: `replay hash mismatch: claimed ${p.logHash}, replayed ${result.logHash}`,
      replayedHash: result.logHash,
    };
  }
  if (result.winner !== p.winner) {
    return { ok: false, error: "replayed winner disagrees with the packet" };
  }
  return { ok: true, verdict: p, replayedHash: result.logHash };
}
