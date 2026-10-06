/**
 * Balance harness — deterministic archetype field for win-rate truth.
 * Pure module: no DOM, no Date.now, no hidden entropy. Same inputs, same report.
 *
 * Strain archetypes share one identical stat template and bite-order kennel, so
 * the only variable between them is the strain itself. Personality archetypes
 * reuse the ghost allocation logic (ALLOC/PREFS from ghosts.ts) as the field.
 */

import { STRAINS, TRICKS, type StrainId } from "../engine/content";
import { simulateBattle, type Dog } from "../engine/battle";
import { ALLOC, PREFS, PERSONALITIES, type Personality } from "./ghosts";

export interface Archetype {
  id: string;
  kind: "strain" | "personality";
  dogs: Dog[];
}

export interface ArchetypeOutcome extends Pick<Archetype, "id" | "kind"> {
  wins: number;
  losses: number;
  draws: number;
  bouts: number;
  winRate: number;
  /** strain archetypes only: win rate over intra-strain-field bouts — the
   * isolated strain comparison (identical template, only the strain varies) */
  strainField?: { wins: number; losses: number; draws: number; bouts: number; winRate: number };
}

export interface BalanceReport {
  /** total bouts simulated (whole round-robin passes, never below 120) */
  bouts: number;
  seeds: number[];
  archetypes: ArchetypeOutcome[];
}

/** Identical for every strain archetype — isolates the strain as the variable. */
const STRAIN_TEMPLATE = { grit: 3, fang: 3, flea: 3 };

/** Identical for every strain archetype; union with the personality prefs covers every trick. */
const STRAIN_ORDERS: string[][] = [
  ["snap", "maul", "backbite", "flurry"],
  ["fleabite", "tickharvest", "bonecrack", "spite"],
  ["howl", "whiffle", "maul", "boneshield"],
];

const STRAIN_POOL: StrainId[] = ["mongrel", "bonehound", "grem", "cur", "brute", "pupp"];
// Identical chassis for every personality bench isolates ALLOC + PREFS as the
// personality variable (mono-chassis stacking skewed the field).
const PERSONALITY_CHASSIS: StrainId[] = ["mongrel", "bonehound", "cur"];

const BASE_SEEDS = [101, 211, 307, 401, 503, 607];
const MIN_BOUTS = 120;

function strainDogs(strain: StrainId): Dog[] {
  return STRAIN_ORDERS.map((order, i) => ({
    id: `bal-${strain}-${i}`,
    name: `${STRAINS[strain].name} Bench ${i + 1}`,
    strain,
    grit: STRAIN_TEMPLATE.grit,
    fang: STRAIN_TEMPLATE.fang,
    flea: STRAIN_TEMPLATE.flea,
    biteOrder: [...order],
    scars: [],
  }));
}

function isDamaging(trickId: string): boolean {
  return (TRICKS[trickId]?.effects ?? []).some((e) => e.kind === "damage" || e.kind === "damageAll");
}

function personalityDogs(personality: Personality): Dog[] {
  const alloc = ALLOC[personality];
  const prefs = PREFS[personality];
  const damaging = prefs.filter(isDamaging);
  return [0, 1, 2].map((i) => {
    const biteOrder = [0, 1, 2, 3].map((k) => prefs[(i * 4 + k) % prefs.length]);
    // a bench must be able to close a bout: any order with no bite at all gets
    // one damage trick, displacing a trick the rest of the field still covers
    if (damaging.length > 0 && !biteOrder.some(isDamaging)) {
      biteOrder[0] = damaging[i % damaging.length];
    }
    return {
      id: `bal-${personality}-${i}`,
      name: `${personality} bench ${i + 1}`,
      strain: PERSONALITY_CHASSIS[i],
      grit: alloc.grit,
      fang: alloc.fang,
      flea: alloc.flea,
      biteOrder: biteOrder.slice(0, 4),
      scars: [],
    };
  });
}

export function buildArchetypes(): Archetype[] {
  const strainField: Archetype[] = STRAIN_POOL.map((strain) => ({
    id: `strain-${strain}`,
    kind: "strain",
    dogs: strainDogs(strain),
  }));
  const personalityField: Archetype[] = PERSONALITIES.map((personality) => ({
    id: `personality-${personality}`,
    kind: "personality",
    dogs: personalityDogs(personality),
  }));
  return [...strainField, ...personalityField];
}

function seedAt(pass: number): number {
  const base = BASE_SEEDS[pass % BASE_SEEDS.length];
  return (base + Math.floor(pass / BASE_SEEDS.length) * 104729) >>> 0;
}

/**
 * Round-robin every archetype against the whole field over fixed seeds.
 * `bouts` is a floor on total bouts; bouts are played in whole round-robin
 * passes (one pass per seed), so the reported count may exceed the floor.
 */
export function runBalanceReport(bouts: number = MIN_BOUTS): BalanceReport {
  const archetypes = buildArchetypes();
  const pairings: [number, number][] = [];
  for (let i = 0; i < archetypes.length; i++) {
    for (let j = i + 1; j < archetypes.length; j++) pairings.push([i, j]);
  }

  const outcomes: ArchetypeOutcome[] = archetypes.map((a) => ({
    id: a.id,
    kind: a.kind,
    wins: 0,
    losses: 0,
    draws: 0,
    bouts: 0,
    winRate: 0,
    ...(a.kind === "strain"
      ? { strainField: { wins: 0, losses: 0, draws: 0, bouts: 0, winRate: 0 } }
      : {}),
  }));

  const target = Math.max(MIN_BOUTS, Math.floor(bouts));
  const seeds: number[] = [];
  let played = 0;
  let pass = 0;
  while (played < target) {
    const seed = seedAt(pass);
    seeds.push(seed);
    for (const [i, j] of pairings) {
      const result = simulateBattle(archetypes[i].dogs, archetypes[j].dogs, seed);
      played += 1;
      const bothStrain = archetypes[i].kind === "strain" && archetypes[j].kind === "strain";
      const tally = (idx: number, field: "win" | "loss" | "draw") => {
        const o = outcomes[idx];
        if (field === "win") o.wins += 1;
        else if (field === "loss") o.losses += 1;
        else o.draws += 1;
        o.bouts += 1;
        if (bothStrain && o.strainField) {
          if (field === "win") o.strainField.wins += 1;
          else if (field === "loss") o.strainField.losses += 1;
          else o.strainField.draws += 1;
          o.strainField.bouts += 1;
        }
      };
      if (result.winner === 0) {
        tally(i, "win");
        tally(j, "loss");
      } else if (result.winner === 1) {
        tally(j, "win");
        tally(i, "loss");
      } else {
        tally(i, "draw");
        tally(j, "draw");
      }
    }
    pass += 1;
  }

  for (const o of outcomes) {
    o.winRate = (o.wins + 0.5 * o.draws) / o.bouts;
    if (o.strainField) {
      o.strainField.winRate =
        o.strainField.bouts > 0
          ? (o.strainField.wins + 0.5 * o.strainField.draws) / o.strainField.bouts
          : 0;
    }
  }

  return { bouts: played, seeds, archetypes: outcomes };
}
