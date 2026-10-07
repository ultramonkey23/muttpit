/**
 * MUTTPIT threat read — pure factual scouting copy about an opposing build.
 *
 * Facts only, never advice and never a predicted winner: each line reports
 * something the opponent's fighting lineup does (who acts first, who hits
 * hardest, what reaches the whole team, what stacks bleed, who opens
 * shielded). Derived strictly from strain/trick truth in src/engine/content.ts
 * and the effective stats from src/engine/battle.ts. Deterministic and
 * DOM-free so any renderer shows the same ordered lines.
 */

import { LINEUP_SIZE, TRICKS, type TrickDef } from "../engine/content";
import { effectiveStats, type Dog } from "../engine/battle";

export type ThreatKind = "speed" | "power" | "barrage" | "bleed" | "shield";

export interface ThreatLine {
  /** which facet of the opposing build this line reports */
  kind: ThreatKind;
  /** id of the dog this line concerns — always inside the fighting lineup */
  dogId: string;
  /** name of the dog this line concerns */
  dogName: string;
  /** one factual sentence, imperative-advice free */
  text: string;
}

/** Scouting stays short: at most this many lines, in a stable order. */
export const MAX_THREAT_LINES = 6;

/** SHIELD 3 is the Bonehound Undead trait (STRAINS.bonehound in content.ts). */
const BONEHOUND_START_SHIELD = 3;

interface Slot {
  dog: Dog;
  slot: number;
  fang: number;
  flea: number;
}

function lineupOf(opponent: Dog[], lineupSize: number): Slot[] {
  const size = Math.max(0, Math.floor(lineupSize));
  return opponent.slice(0, size).map((dog, slot) => {
    const eff = effectiveStats(dog);
    return { dog, slot, fang: eff.fang, flea: eff.flea };
  });
}

/** Engine tick order inside one team: FLEA desc, pupp wins ties, then slot order. */
function byTickOrder(a: Slot, b: Slot): number {
  return (
    b.flea - a.flea ||
    (a.dog.strain === "pupp" ? -1 : 0) - (b.dog.strain === "pupp" ? -1 : 0) ||
    a.slot - b.slot
  );
}

function byFang(a: Slot, b: Slot): number {
  return b.fang - a.fang || a.slot - b.slot;
}

function knownTricks(dog: Dog): TrickDef[] {
  const out: TrickDef[] = [];
  const seen = new Set<string>();
  for (const id of dog.biteOrder) {
    const trick = TRICKS[id];
    if (!trick || seen.has(trick.id)) continue;
    seen.add(trick.id);
    out.push(trick);
  }
  return out;
}

function bleedPower(trick: TrickDef): number {
  return trick.effects.reduce(
    (sum, e) => sum + (e.kind === "apply" && e.status === "bleed" ? e.power : 0),
    0,
  );
}

function shieldPower(trick: TrickDef): number {
  return trick.effects.reduce((sum, e) => sum + (e.kind === "shield" ? e.power : 0), 0);
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  const last = names[names.length - 1] ?? "";
  if (names.length === 1) return last;
  return `${names.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * Read the threats of an opponent's fighting lineup (the first `lineupSize`
 * dogs, exactly as the engine fields them). Pure and deterministic: the same
 * build always yields the same ordered fact lines.
 */
export function threatRead(opponent: Dog[], lineupSize: number = LINEUP_SIZE): ThreatLine[] {
  const lineup = lineupOf(opponent, lineupSize);
  if (lineup.length === 0) return [];

  const head: ThreatLine[] = [];
  if (lineup.length > 1) {
    const first = [...lineup].sort(byTickOrder)[0];
    if (first) {
      const tieNote = first.dog.strain === "pupp" ? "; Pupp wins tick ties" : "";
      head.push({
        kind: "speed",
        dogId: first.dog.id,
        dogName: first.dog.name,
        text: `${first.dog.name} acts first — FLEA ${first.flea}${tieNote}.`,
      });
    }
    const hardest = [...lineup].sort(byFang)[0];
    if (hardest) {
      head.push({
        kind: "power",
        dogId: hardest.dog.id,
        dogName: hardest.dog.name,
        text: `${hardest.dog.name} hits hardest — FANG ${hardest.fang}.`,
      });
    }
  }

  const barrage: ThreatLine[] = [];
  const bleed: ThreatLine[] = [];
  const shield: ThreatLine[] = [];

  for (const s of lineup) {
    const name = s.dog.name;
    const tricks = knownTricks(s.dog);

    const barrages = tricks.filter((t) => t.tags.includes("barrage"));
    if (barrages.length > 0) {
      barrage.push({
        kind: "barrage",
        dogId: s.dog.id,
        dogName: name,
        text: `${name} brings ${joinNames(barrages.map((t) => t.name))} — it can hit the whole team, the back line included.`,
      });
    }

    const bleedParts: string[] = [];
    if (s.dog.strain === "cur") bleedParts.push("its attacks add BLEED 1");
    for (const t of tricks) {
      const power = bleedPower(t);
      if (power > 0) bleedParts.push(`${t.name} adds BLEED ${power}`);
    }
    if (bleedParts.length > 0) {
      bleed.push({
        kind: "bleed",
        dogId: s.dog.id,
        dogName: name,
        text: `${name} stacks bleed — ${bleedParts.join("; ")}.`,
      });
    }

    const shieldParts: string[] = [];
    if (s.dog.strain === "bonehound") {
      shieldParts.push(`the Undead trait opens the bout with SHIELD ${BONEHOUND_START_SHIELD}`);
    }
    for (const t of tricks) {
      const power = shieldPower(t);
      if (power > 0) shieldParts.push(`${t.name} adds SHIELD ${power}`);
    }
    if (shieldParts.length > 0) {
      const lead =
        s.dog.strain === "bonehound" ? `${name} starts shielded` : `${name} carries shield tricks`;
      shield.push({
        kind: "shield",
        dogId: s.dog.id,
        dogName: name,
        text: `${lead} — ${shieldParts.join("; ")}.`,
      });
    }
  }

  // interleave categories so the cap never drops a whole class of threat
  const rest: ThreatLine[] = [];
  const pools = [barrage, bleed, shield];
  const width = Math.max(barrage.length, bleed.length, shield.length);
  for (let i = 0; i < width; i++) {
    for (const pool of pools) {
      const line = pool[i];
      if (line) rest.push(line);
    }
  }

  return [...head, ...rest].slice(0, MAX_THREAT_LINES);
}
