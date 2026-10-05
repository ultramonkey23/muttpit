/**
 * Ghost kennels — the non-live PvP population of the Bone Bracket.
 * Deterministic from seed: a ghost is an exact build, and its behavior is auditable.
 */

import { TRICK_IDS, type StrainId } from "../engine/content";
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
  aggressive: ["maul", "snap", "flurry", "verdict", "sic", "packpounce", "goForTheEyes"],
  defensive: ["cower", "boneshield", "rally", "countersnarl", "lickwounds", "secondwind", "snap"],
  trickster: ["mudtoss", "goad", "goForTheEyes", "fleabite", "tickharvest", "shriek", "playdead"],
  pack: ["howl", "packpounce", "rally", "lickwounds", "snap", "shriek"],
  feral: ["spite", "marrow", "backbite", "fleabite", "sic", "maul"],
};

export const ALLOC: Record<Personality, { grit: number; fang: number; flea: number }> = {
  aggressive: { grit: 1, fang: 6, flea: 3 },
  defensive: { grit: 6, fang: 2, flea: 2 },
  trickster: { grit: 2, fang: 3, flea: 5 },
  pack: { grit: 3, fang: 4, flea: 3 },
  feral: { grit: 5, fang: 4, flea: 1 },
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

function makeGhostDog(rng: () => number, personality: Personality, skill: number, idx: number): Dog {
  const strain = pick(rng, STRAIN_POOL);
  const alloc = ALLOC[personality];
  const budget = 8 + Math.round(skill * 4) + (idx === 0 ? 2 : 0);
  const scale = budget / 10;
  const prefs = PREFS[personality];
  const orderLen = 2 + rollInt(rng, 3);
  const biteOrder: string[] = [];
  while (biteOrder.length < orderLen) {
    const trick = rollInt(rng, 3) === 0 ? pick(rng, TRICK_IDS) : pick(rng, prefs);
    if (!biteOrder.includes(trick)) biteOrder.push(trick);
  }
  return {
    id: `ghost-${personality}-${idx}-${rollInt(rng, 1 << 20)}`,
    name: `${pick(rng, PREFIX)} ${pick(rng, SUFFIX)}`,
    strain,
    grit: Math.round(alloc.grit * scale),
    fang: Math.round(alloc.fang * scale),
    flea: Math.round(alloc.flea * scale),
    biteOrder,
    scars: [],
  };
}

export function makeGhost(seed: number, index: number): GhostKennel {
  const rng = mulberry32((seed ^ (index * 2654435761)) >>> 0);
  const personality = PERSONALITIES[rollInt(rng, PERSONALITIES.length)];
  const skill = 0.25 + rng() * 0.6;
  const dogCount = 3 + rollInt(rng, 2);
  const dogs: Dog[] = [];
  for (let i = 0; i < dogCount; i++) dogs.push(makeGhostDog(rng, personality, skill, i));
  return {
    id: `ghost-${index}-${seed.toString(16)}`,
    name: pick(rng, KENNEL_NAMES),
    motto: pick(rng, MOTTOS),
    personality,
    skill,
    kennel: { v: 1, name: pick(rng, KENNEL_NAMES), motto: pick(rng, MOTTOS), dogs },
  };
}

export function makeGhostLeague(seed: number, count: number): GhostKennel[] {
  const ghosts: GhostKennel[] = [];
  for (let i = 0; i < count; i++) ghosts.push(makeGhost(seed, i));
  return ghosts;
}
