/**
 * The Pound — draft offers. Scrap in, mongrels and tricks out.
 * Offers are deterministic per seed: the Pound is crooked, but never random.
 */

import { TRICKS, type StrainId } from "../engine/content";
import type { Dog } from "../engine/battle";
import { mulberry32, rollInt } from "../engine/rng";

export const DOG_PRICE = 40;
export const TRICK_PRICE = 25;

export interface PoundOffer {
  seed: number;
  dogs: Dog[];
  tricks: string[];
}

const NAMES = ["Nubbins", "Duchess", "Big Sad", "Officer Grime", "Teeth", "Little Riot", "Baron Mange", "Pockets", "Saint Vitus", "Cricket", "Moms", "Duke Flea", "Bones", "Feral Beth", "Gasket", "Wobbles"];
const STRAIN_POOL: StrainId[] = ["mongrel", "bonehound", "grem", "cur", "brute", "pupp"];

export function poundOffers(seed: number): PoundOffer {
  const rng = mulberry32(seed >>> 0);
  const dogs: Dog[] = [];
  for (let i = 0; i < 3; i++) {
    const strain = STRAIN_POOL[rollInt(rng, STRAIN_POOL.length)];
    const budget = 7 + rollInt(rng, 5);
    const grit = 1 + rollInt(rng, Math.max(1, budget - 2));
    const fang = 1 + rollInt(rng, Math.max(1, budget - grit));
    const flea = Math.max(1, budget - grit - fang);
    const orderLen = 2 + rollInt(rng, 3);
    const ids = Object.keys(TRICKS);
    const biteOrder: string[] = [];
    while (biteOrder.length < orderLen) {
      const trick = ids[rollInt(rng, ids.length)];
      if (!biteOrder.includes(trick)) biteOrder.push(trick);
    }
    dogs.push({
      id: `pound-${seed}-${i}`,
      name: NAMES[(seed + i * 7) % NAMES.length],
      strain,
      grit,
      fang,
      flea,
      biteOrder,
      scars: [],
    });
  }
  const trickIds = Object.keys(TRICKS);
  const tricks: string[] = [];
  while (tricks.length < 3) {
    const trick = trickIds[rollInt(rng, trickIds.length)];
    if (!tricks.includes(trick)) tricks.push(trick);
  }
  return { seed: seed >>> 0, dogs, tricks };
}

/** Teaching a dog a trick: appends to its bite order (up to 4). */
export function teachTrick(dog: Dog, trickId: string): { ok: boolean; error?: string } {
  if (!(trickId in TRICKS)) return { ok: false, error: "the Pit has no such trick" };
  if (dog.biteOrder.includes(trickId)) return { ok: false, error: "already knows it" };
  if (dog.biteOrder.length >= 4) return { ok: false, error: "bite order is full" };
  dog.biteOrder.push(trickId);
  return { ok: true };
}
