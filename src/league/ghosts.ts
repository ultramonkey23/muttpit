/**
 * Ghost kennels — the non-live PvP population of the Bone Bracket.
 * Deterministic from seed: a ghost is an exact build, and its behavior is auditable.
 */

import { TRICKS, TRICK_IDS, type StrainId } from "../engine/content";
import type { Dog } from "../engine/battle";
import { mulberry32, rollInt } from "../engine/rng";
import type { Kennel } from "../async/packets";

export type Personality = "aggressive" | "defensive" | "trickster" | "pack" | "feral";

export interface GhostKennel {
  id: string;
  name: string;
  motto: string;
  personality: Personality;
  skill: number;
  kennel: Kennel;
}

export const PERSONALITIES: Personality[] = ["aggressive", "defensive", "trickster", "pack", "feral"];

export const PREFS: Record<Personality, string[]> = {
  aggressive: ["maul", "snap", "flurry", "sic", "packpounce", "fleabite", "tickharvest"],
  defensive: ["bonecrack", "cower", "verdict", "countersnarl", "snap", "rally", "secondwind"],
  trickster: ["mudtoss", "goad", "goForTheEyes", "fleabite", "tickharvest", "shriek", "playdead"],
  pack: ["whiffle", "howl", "packpounce", "rally", "snap", "shriek", "lickwounds"],
  feral: ["spite", "marrow", "backbite", "fleabite", "maul", "cower"],
};

export const ALLOC: Record<Personality, { grit: number; fang: number; flea: number }> = {
  aggressive: { grit: 0, fang: 1, flea: 1 },
  defensive: { grit: 5, fang: 3, flea: 2 },
  trickster: { grit: 3, fang: 4, flea: 5 },
  pack: { grit: 3, fang: 4, flea: 4 },
  feral: { grit: 1, fang: 1, flea: 2 },
};

// Aggressive ghosts field a slightly lower budget than the other personalities.
// Measured on two independent seed families, the untouched starter trio beat
// aggressive ghosts only ~0.14 of the time at pressure 0 (a near auto-loss that
// decided ~one week in eight by the schedule alone). Trimming their budget —
// not the shared ALLOC split — keeps aggressive the hardest matchup while lifting
// the starter above the 0.25 floor on every family. Other personalities keep the
// full budget so the overall ladder and balance harness are untouched.
const PERSONALITY_BUDGET_DELTA: Record<Personality, number> = {
  aggressive: -4,
  defensive: 0,
  trickster: 0,
  pack: 0,
  feral: 0,
};

const STRAIN_POOL: StrainId[] = ["mongrel", "bonehound", "grem", "cur", "brute", "pupp"];

const PREFIX = ["Gnash", "Rip", "Snarl", "Vex", "Mange", "Brut", "Cinder", "Howl", "Gore", "Rust", "Bolt", "Wheeze", "Knuckle", "Saint", "Doctor", "Comrade"];
const SUFFIX = ["tooth", "muzzle", "leg", "hound", "cur", "terrier", "jaws", "paws", "tail", "barker", "bucket", "widow", "junior", "the-third"];

const KENNEL_NAMES = ["The Rust Yard", "Sewer Saints", "Gnash Estate", "The Whiffle Club", "Bucket Kennels", "The Bone Trust", "Widow's Mange", "The Scrap Choir", "Saint Gnash's Home", "Comrade Cur's Pack"];
const MOTTOS = [
  "Bite first. File later.",
  "We keep the receipts.",
  "Loyalty is a muzzle made of paperwork.",
  "Every dog has its day in court.",
  "Lose small. Scar big.",
  "The Pit decides.",
  "Chewed up, spit out, promoted.",
  "We came for the scrap and stayed for spite.",
];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[rollInt(rng, arr.length)];
}

/** A trick that can actually close a bout — a ghost with no bite never finishes one. */
function isDamaging(trickId: string): boolean {
  return (TRICKS[trickId]?.effects ?? []).some((e) => e.kind === "damage" || e.kind === "damageAll");
}

/**
 * Ghost stat budget — the ladder itself. Every personality fields the same
 * point budget per dog (except aggressive, which fields PERSONALITY_BUDGET_DELTA
 * fewer points so a fresh kennel is never auto-locked out of one week in eight);
 * ALLOC is a *flavor* weight for how those points spread, not the points
 * themselves (the old proportional scaling starved aggressive and feral ghosts
 * into free wins). Pressure is added outside the rng stream, so one seed breeds
 * the same dog at every pressure — only harder — and the ladder climbs
 * monotonically instead of re-rolling.
 *
 * Calibrated against the untouched starter trio in tests/ghost-ladder.test.ts
 * across two independent seed families: starter win rate lands 0.55-0.75 at
 * pressure 0, every personality stays in 0.25-0.80 (aggressive hardest), the
 * curve falls every rung, and sits at or below 0.35 at pressure 6 (Crown Pit,
 * late seasons).
 */
const BUDGET_BASE = 9;
const BUDGET_SKILL = 6;
const BUDGET_FRONT = 2;
const BUDGET_PER_PRESSURE = 1.25;

/** Largest-remainder split of `budget` across grit/fang/flea by flavor weights. */
function allocateStats(
  budget: number,
  weights: { grit: number; fang: number; flea: number },
): { grit: number; fang: number; flea: number } {
  const total = weights.grit + weights.fang + weights.flea;
  const raw = {
    grit: (budget * weights.grit) / total,
    fang: (budget * weights.fang) / total,
    flea: (budget * weights.flea) / total,
  };
  const out = {
    grit: Math.floor(raw.grit),
    fang: Math.floor(raw.fang),
    flea: Math.floor(raw.flea),
  };
  const remainders = (
    [
      { key: "grit", rem: raw.grit - out.grit },
      { key: "fang", rem: raw.fang - out.fang },
      { key: "flea", rem: raw.flea - out.flea },
    ] as { key: "grit" | "fang" | "flea"; rem: number }[]
  ).sort((a, b) => b.rem - a.rem);
  let spent = out.grit + out.fang + out.flea;
  let i = 0;
  while (spent < budget) {
    const key = remainders[i % remainders.length].key;
    if (key === "grit") out.grit += 1;
    else if (key === "fang") out.fang += 1;
    else out.flea += 1;
    spent += 1;
    i += 1;
  }
  return out;
}

function makeGhostDog(
  rng: () => number,
  personality: Personality,
  skill: number,
  idx: number,
  pressure: number,
): Dog {
  const strain = pick(rng, STRAIN_POOL);
  const alloc = ALLOC[personality];
  const budget =
    BUDGET_BASE +
    PERSONALITY_BUDGET_DELTA[personality] +
    Math.round(skill * BUDGET_SKILL) +
    (idx === 0 ? BUDGET_FRONT : 0) +
    Math.round(Math.max(0, pressure) * BUDGET_PER_PRESSURE);
  // flat core + personality flavor, so every personality is a real fight
  const stats = allocateStats(budget, {
    grit: 3 + alloc.grit,
    fang: 3 + alloc.fang,
    flea: 3 + alloc.flea,
  });
  const prefs = PREFS[personality];
  const orderLen = 2 + rollInt(rng, 3);
  const biteOrder: string[] = [];
  while (biteOrder.length < orderLen) {
    const trick = rollInt(rng, 3) === 0 ? pick(rng, TRICK_IDS) : pick(rng, prefs);
    if (!biteOrder.includes(trick)) biteOrder.push(trick);
  }
  // every ghost closes its own bouts: no all-utility bite orders. This branch
  // only fires when the order holds no damaging trick, so the swap cannot dupe.
  const damaging = prefs.filter(isDamaging);
  if (damaging.length > 0 && !biteOrder.some(isDamaging)) {
    biteOrder[0] = damaging[idx % damaging.length];
  }
  return {
    id: `ghost-${personality}-${idx}-${rollInt(rng, 1 << 20)}`,
    name: `${pick(rng, PREFIX)} ${pick(rng, SUFFIX)}`,
    strain,
    grit: stats.grit,
    fang: stats.fang,
    flea: stats.flea,
    biteOrder,
    scars: [],
  };
}

/** pressure = season ladder (0-based) + division index; later weeks and higher
 * pits field sharper ghosts, player-like, without touching engine math. The
 * budget ladder lives in makeGhostDog — the same seed breeds the same dogs at
 * every pressure, only stronger, so difficulty climbs monotonically (measured
 * by tests/ghost-ladder.test.ts). */
export function makeGhost(seed: number, index: number, pressure = 0): GhostKennel {
  const rng = mulberry32((seed ^ (index * 2654435761)) >>> 0);
  const personality = PERSONALITIES[rollInt(rng, PERSONALITIES.length)];
  const skill = Math.min(0.95, 0.25 + rng() * 0.6 + Math.max(0, pressure) * 0.05);
  const dogCount = 3 + rollInt(rng, 2);
  const dogs: Dog[] = [];
  for (let i = 0; i < dogCount; i++) dogs.push(makeGhostDog(rng, personality, skill, i, pressure));
  const baseName = KENNEL_NAMES[((seed >>> 0) + index) % KENNEL_NAMES.length];
  const kennelName = index < KENNEL_NAMES.length ? baseName : `${baseName} #${index + 1}`;
  const motto = pick(rng, MOTTOS);
  return {
    id: `ghost-${index}-${seed.toString(16)}`,
    name: kennelName,
    motto,
    personality,
    skill,
    kennel: { v: 1, name: kennelName, motto, dogs },
  };
}

export function makeGhostLeague(seed: number, count: number, pressure = 0): GhostKennel[] {
  const ghosts: GhostKennel[] = [];
  for (let i = 0; i < count; i++) ghosts.push(makeGhost(seed, i, pressure));
  return ghosts;
}
