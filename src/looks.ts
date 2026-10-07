/**
 * The kennel's visual grammar: six authored looks per strain.
 * A look is a dog's face, gear and temperament — it never changes what the
 * dog does in the Pit (the engine never reads it), but it is who the dog is.
 */

import { fnv1a } from "./engine/rng";
import type { StrainId } from "./engine/content";
import type { Dog } from "./engine/battle";

export interface Look {
  id: string;
  strain: StrainId;
  name: string;
  /** one-line temperament, in the Pit's voice */
  line: string;
}

const L = (strain: StrainId, rows: [string, string, string][]): Look[] =>
  rows.map(([id, name, line]) => ({ id: `${strain}_${id}`, strain, name, line }));

export const LOOKS: Record<StrainId, Look[]> = {
  mongrel: L("mongrel", [
    ["patchwork", "Patchwork", "Two dogs' worth of coat and neither one's manners."],
    ["bandit", "Bandit", "Steals the bone, then the bowl, then the kennel."],
    ["oldtimer", "Old Timer", "Has seen every trick. Bit most of them."],
    ["bruiser", "Corner Bruiser", "Fights like rent is due."],
    ["scruff", "Scruff", "Smells like the alley it owns."],
    ["hustler", "Hustler", "Will sell you your own collar."],
  ]),
  bonehound: L("bonehound", [
    ["halfskull", "Half-Skull", "Already died once. Filed a complaint."],
    ["cagewalker", "Cage Walker", "Rattles when it breathes. It doesn't need to."],
    ["mourner", "Mourner", "Wears its own funeral."],
    ["gravedigger", "Gravedigger", "Buries its wins. Digs them back up."],
    ["stitchjaw", "Stitch-Jaw", "Sewn shut once. Chewed through the thread."],
    ["lantern", "Lantern", "The Pit lights up when it walks in."],
  ]),
  grem: L("grem", [
    ["sparkplug", "Sparkplug", "Small, loud, legally a hazard."],
    ["fusebox", "Fusebox", "Do not lick. It will lick back."],
    ["chewtoy", "Chewtoy", "Ate the warning label."],
    ["needler", "Needler", "Mostly teeth. Partly worse."],
    ["junkrat", "Junk Rat", "Built from the parts the others left."],
    ["smokestack", "Smokestack", "Leaves a trail. Leaves a smell."],
  ]),
  cur: L("cur", [
    ["slinker", "Slinker", "Bites first, negotiates never."],
    ["oneeye", "One-Eye", "Counts its enemies on fewer toes."],
    ["razorback", "Razorback", "Every hair a grudge."],
    ["alleyjack", "Alley Jack", "Owes nothing. Owed plenty."],
    ["redmuzzle", "Red Muzzle", "Licked the floor of the Pit clean."],
    ["grinner", "Grinner", "Smiles the whole way down."],
  ]),
  brute: L("brute", [
    ["hubcap", "Hubcap", "Solves problems by becoming a larger problem."],
    ["padlock", "Padlock", "Locked in. Nobody kept the key."],
    ["wrecker", "Wrecker", "Walks through fences. Doesn't notice."],
    ["bucket", "Bucket Head", "Would rather be napping. Will end you anyway."],
    ["tankjaw", "Tank Jaw", "Its bite has its own weather."],
    ["barrel", "Barrel", "Rolls in. Never rolls out."],
  ]),
  pupp: L("pupp", [
    ["goggles", "Goggles", "Fast enough to regret everything later."],
    ["scarf", "Scarf", "Trips over its own victory lap."],
    ["sneaker", "Sneaker", "Stole a shoe. Became the shoe."],
    ["rocket", "Rocket", "Zero to bite in no seconds."],
    ["sweetfang", "Sweet Fang", "Adorable. Then not."],
    ["pipsqueak", "Pipsqueak", "Barks at the moon. The moon backs off."],
  ]),
};

const BY_ID: Record<string, Look> = Object.fromEntries(
  Object.values(LOOKS).flat().map((l) => [l.id, l]),
);

/** Strip the per-purchase suffix so a Pound dog keeps its face after you buy it. */
function identityKey(dog: Pick<Dog, "id" | "name" | "strain">): string {
  return `${dog.strain}|${dog.name}|${dog.id.replace(/^(pound-\d+-\d+)-\d+$/, "$1")}`;
}

/** A dog's look: its stamped look if it carries one, else a stable pick from its identity. */
export function lookFor(dog: Pick<Dog, "id" | "name" | "strain" | "look">): Look {
  const stamped = dog.look ? BY_ID[dog.look] : undefined;
  if (stamped && stamped.strain === dog.strain) return stamped;
  const family = LOOKS[dog.strain];
  return family[fnv1a(identityKey(dog)) % family.length];
}

/** Small, stable coat variation layered on the authored look (degrees, multiplier). */
export function coatShift(dog: Pick<Dog, "id" | "name" | "strain">): { hue: number; sat: number } {
  const h = fnv1a(`coat|${identityKey(dog)}`);
  return { hue: (h % 25) - 12, sat: 0.9 + ((h >> 8) % 25) / 100 };
}
