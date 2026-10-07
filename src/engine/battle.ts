/**
 * MUTTPIT battle engine — deterministic, auditable, replayable.
 * Pure module: no DOM, no Date.now, no hidden entropy. Same inputs, same log, same hash.
 */

import {
  KENNEL_SIZE,
  LINEUP_SIZE,
  MAX_ROUNDS,
  STRAINS,
  TRICKS,
  type Effect,
  type StatusId,
  type StrainId,
} from "./content";
import { mulberry32, nick } from "./rng";

export interface Scar {
  id: string;
  name: string;
  text: string;
  dGrit: number;
  dFang: number;
  dFlea: number;
}

export interface Dog {
  id: string;
  name: string;
  strain: StrainId;
  grit: number;
  fang: number;
  flea: number;
  biteOrder: string[];
  scars: Scar[];
  /** authored look id (presentation identity) — the engine never reads it */
  look?: string;
}

export interface BattleEvent {
  round: number;
  kind: "start" | "trick" | "hit" | "status" | "heal" | "death" | "end";
  text: string;
  actor?: string;
  target?: string;
  hp?: Record<string, number>;
  /** live statuses per fighter ("team:name" -> "bleed2 shield3"); presentation only, never hashed */
  fx?: Record<string, string>;
}

export interface BattleResult {
  winner: 0 | 1 | -1;
  rounds: number;
  events: BattleEvent[];
  logHash: string;
  survivorHp: [number, number];
  survivors: { team: 0 | 1; name: string; hp: number; maxHp: number }[];
}

interface Fighter {
  dog: Dog;
  team: 0 | 1;
  slot: number;
  hp: number;
  maxHp: number;
  fang: number;
  flea: number;
  statuses: Record<StatusId, number>;
  trickIdx: number;
  scrappyUsed: boolean;
  alive: boolean;
}

export function effectiveStats(dog: Dog): { grit: number; fang: number; flea: number } {
  const s = STRAINS[dog.strain].base;
  let grit = s.grit + dog.grit;
  let fang = s.fang + dog.fang;
  let flea = s.flea + dog.flea;
  for (const scar of dog.scars) {
    grit += scar.dGrit;
    fang += scar.dFang;
    flea += scar.dFlea;
  }
  return {
    grit: Math.max(4, grit),
    fang: Math.max(1, fang),
    flea: Math.max(1, flea),
  };
}

function makeFighter(dog: Dog, team: 0 | 1, slot: number): Fighter {
  const eff = effectiveStats(dog);
  const statuses: Record<StatusId, number> = {
    bleed: 0,
    shield: 0,
    rage: 0,
    cower: 0,
    marked: 0,
    dodge: 0,
  };
  return {
    dog,
    team,
    slot,
    hp: eff.grit,
    maxHp: eff.grit,
    fang: eff.fang,
    flea: eff.flea,
    statuses,
    trickIdx: 0,
    scrappyUsed: false,
    alive: true,
  };
}

function frontMost(fighters: Fighter[]): Fighter | undefined {
  const live = fighters.filter((f) => f.alive);
  live.sort((a, b) => a.slot - b.slot);
  return live[0];
}

function backMost(fighters: Fighter[]): Fighter | undefined {
  const live = fighters.filter((f) => f.alive);
  live.sort((a, b) => b.slot - a.slot);
  return live[0];
}

function lowestGrit(fighters: Fighter[]): Fighter | undefined {
  const live = fighters.filter((f) => f.alive);
  if (live.length === 0) return undefined;
  live.sort((a, b) => a.hp - b.hp || a.slot - b.slot);
  return live[0];
}

function livingCount(fighters: Fighter[]): number {
  return fighters.filter((f) => f.alive).length;
}

interface Sim {
  fighters: Fighter[];
  events: BattleEvent[];
  rng: () => number;
  round: number;
}

function hpSnapshot(sim: Sim): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of sim.fighters) out[`${f.team}:${f.dog.name}`] = Math.max(0, f.hp);
  return out;
}

function fxSnapshot(sim: Sim): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of sim.fighters) {
    if (!f.alive) continue;
    const parts: string[] = [];
    for (const k of Object.keys(f.statuses) as StatusId[]) {
      if (f.statuses[k] > 0) parts.push(`${k}${f.statuses[k]}`);
    }
    if (parts.length) out[`${f.team}:${f.dog.name}`] = parts.join(" ");
  }
  return out;
}

function pushEvent(
  sim: Sim,
  kind: BattleEvent["kind"],
  text: string,
  extra: Partial<BattleEvent> = {},
): void {
  sim.events.push({ round: sim.round, kind, text, hp: hpSnapshot(sim), fx: fxSnapshot(sim), ...extra });
}

function currentFang(f: Fighter): number {
  const grem = f.dog.strain === "grem" && f.hp < f.maxHp * 0.75 ? 2 : 0;
  return f.fang + grem + f.statuses.rage;
}

function dealDamage(
  sim: Sim,
  source: Fighter | undefined,
  target: Fighter,
  raw: number,
  opts: { barrage?: boolean } = {},
): void {
  if (!target.alive) return;
  if (target.statuses.dodge > 0) {
    target.statuses.dodge -= 1;
    pushEvent(sim, "status", `${target.dog.name} plays dead — the hit whiffs.`, {
      actor: source?.dog.name,
      target: target.dog.name,
    });
    return;
  }
  let dmg = raw;
  if (source) dmg += source.statuses.rage - source.statuses.cower;
  if (source && source.dog.strain === "mongrel" && !target.scrappyUsed) {
    target.scrappyUsed = true;
    dmg -= 2;
    pushEvent(sim, "status", `${target.dog.name} is scrappy — shrugs 2 off its first hit.`, {
      actor: source.dog.name,
      target: target.dog.name,
    });
  }
  if (opts.barrage && target.dog.strain === "brute") {
    dmg -= 2;
    pushEvent(sim, "status", `${target.dog.name} is heavy — shrugs 2 off the barrage.`, {
      actor: source?.dog.name,
      target: target.dog.name,
    });
  }
  dmg += target.statuses.marked;
  dmg += nick(sim.rng);
  if (dmg < 0) dmg = 0;

  if (target.statuses.shield > 0) {
    const absorbed = Math.min(target.statuses.shield, dmg);
    target.statuses.shield -= absorbed;
    dmg -= absorbed;
    if (absorbed > 0) {
      pushEvent(sim, "status", `${target.dog.name}'s shield eats ${absorbed}.`, {
        actor: source?.dog.name,
        target: target.dog.name,
      });
    }
  }
  if (dmg > 0) {
    target.hp -= dmg;
    pushEvent(sim, "hit", `${target.dog.name} takes ${dmg}.`, {
      actor: source?.dog.name,
      target: target.dog.name,
    });
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      pushEvent(sim, "death", `${target.dog.name} goes down.`, {
        actor: source?.dog.name,
        target: target.dog.name,
      });
    }
  }
}

function resolveEffect(
  sim: Sim,
  actor: Fighter,
  target: Fighter | undefined,
  effect: Effect,
): void {
  const enemies = sim.fighters.filter((f) => f.team !== actor.team);
  const allies = sim.fighters.filter((f) => f.team === actor.team);
  switch (effect.kind) {
    case "damage": {
      if (!target) return;
      let raw = effect.power + (effect.fromFang ? currentFang(actor) : 0);
      if (effect.perBleedOnTarget) raw += effect.power * (target.statuses.bleed || 0);
      if (effect.perOtherAlly) raw += effect.power * allies.filter((a) => a.alive && a !== actor).length * 2;
      if (effect.perOwnMissingGrit) raw += Math.floor((actor.maxHp - actor.hp) / 2);
      if (actor.dog.strain === "cur") {
        target.statuses.bleed += 1;
        pushEvent(sim, "status", `${target.dog.name} starts bleeding.`, {
          actor: actor.dog.name,
          target: target.dog.name,
        });
      }
      dealDamage(sim, actor, target, raw);
      break;
    }
    case "damageAll": {
      for (const e of enemies) {
        if (!e.alive) continue;
        dealDamage(sim, actor, e, effect.power, { barrage: true });
      }
      break;
    }
    case "heal": {
      const t2 = target ?? actor;
      if (!t2.alive) return;
      t2.hp = Math.min(t2.maxHp, t2.hp + effect.power);
      pushEvent(sim, "heal", `${t2.dog.name} recovers ${effect.power}.`, {
        actor: actor.dog.name,
        target: t2.dog.name,
      });
      break;
    }
    case "shield": {
      const t2 = target ?? actor;
      if (!t2.alive) return;
      t2.statuses.shield += effect.power;
      pushEvent(sim, "status", `${t2.dog.name} gains SHIELD ${effect.power}.`, {
        actor: actor.dog.name,
        target: t2.dog.name,
      });
      break;
    }
    case "apply": {
      if (effect.status === undefined || !target) return;
      if (!target.alive) return;
      target.statuses[effect.status] += effect.power;
      pushEvent(sim, "status", `${target.dog.name} gains ${effect.status.toUpperCase()} ${effect.power}.`, {
        actor: actor.dog.name,
        target: target.dog.name,
      });
      break;
    }
  }
}

function playTrick(sim: Sim, actor: Fighter, teams: Fighter[][]): void {
  const enemies = teams[actor.team === 0 ? 1 : 0];
  const allies = teams[actor.team];
  const order = actor.dog.biteOrder;
  const trickId = order.length > 0 ? order[actor.trickIdx % order.length] : "snap";
  actor.trickIdx += 1;
  const trick = TRICKS[trickId] ?? TRICKS.snap;
  pushEvent(sim, "trick", `${actor.dog.name} plays ${trick.name}.`, { actor: actor.dog.name });

  let primary: Fighter | undefined;
  switch (trick.target) {
    case "enemyFront":
      primary = frontMost(enemies);
      break;
    case "enemyBack":
      primary = backMost(enemies);
      break;
    case "enemyAny":
      primary = frontMost(enemies);
      break;
    case "allEnemies":
      primary = undefined;
      break;
    case "self":
      primary = actor;
      break;
    case "allyLow":
      primary = lowestGrit(allies) ?? actor;
      break;
    case "allAllies":
      primary = undefined;
      break;
  }

  for (const effect of trick.effects) {
    if (trick.target === "allEnemies" && (effect.kind === "damageAll" || effect.kind === "apply")) {
      if (effect.kind === "damageAll") {
        resolveEffect(sim, actor, undefined, effect);
      } else {
        for (const e of enemies) {
          if (e.alive) resolveEffect(sim, actor, e, effect);
        }
      }
    } else if (trick.target === "allAllies") {
      for (const a of allies) {
        if (a.alive) resolveEffect(sim, actor, a, effect);
      }
    } else {
      resolveEffect(sim, actor, primary, effect);
    }
  }
}

function tickStart(sim: Sim, f: Fighter): void {
  if (f.statuses.bleed > 0) {
    const bleed = f.statuses.bleed;
    f.hp -= bleed;
    pushEvent(sim, "hit", `${f.dog.name} bleeds for ${bleed}.`, { actor: f.dog.name, target: f.dog.name });
    if (f.hp <= 0) {
      f.hp = 0;
      f.alive = false;
      pushEvent(sim, "death", `${f.dog.name} bleeds out.`, { target: f.dog.name });
    }
  }
}

export function simulateBattle(
  teamADogs: Dog[],
  teamBDogs: Dog[],
  seed: number,
): BattleResult {
  const dogsA = teamADogs.slice(0, LINEUP_SIZE);
  const dogsB = teamBDogs.slice(0, LINEUP_SIZE);
  const fighters: Fighter[] = [
    ...dogsA.map((d, i) => makeFighter(d, 0, i)),
    ...dogsB.map((d, i) => makeFighter(d, 1, i)),
  ];
  const teams: Fighter[][] = [fighters.slice(0, dogsA.length), fighters.slice(dogsA.length)];
  const sim: Sim = { fighters, events: [], rng: mulberry32(seed >>> 0), round: 0 };

  pushEvent(sim, "start", "The Pit locks the gate. Bout starts.", { actor: undefined });

  // strain passives
  for (const f of fighters) {
    if (f.dog.strain === "bonehound") {
      f.statuses.shield += 3;
      pushEvent(sim, "status", `${f.dog.name} rattles to life with SHIELD 3.`, {
        actor: f.dog.name,
        target: f.dog.name,
      });
    }
  }

  while (sim.round < MAX_ROUNDS) {
    sim.round += 1;
    const order = fighters
      .filter((f) => f.alive)
      .sort(
        (a, b) =>
          b.flea - a.flea ||
          (a.dog.strain === "pupp" ? -1 : 0) - (b.dog.strain === "pupp" ? -1 : 0) ||
          a.slot - b.slot ||
          (a.team === 0 ? -1 : 1),
      );
    for (const f of order) {
      if (!f.alive) continue;
      tickStart(sim, f);
      if (!f.alive) continue;
      playTrick(sim, f, teams);
      const aliveA = livingCount(teams[0]);
      const aliveB = livingCount(teams[1]);
      if (aliveA === 0 || aliveB === 0) break;
    }
    const aliveA = livingCount(teams[0]);
    const aliveB = livingCount(teams[1]);
    if (aliveA === 0 || aliveB === 0) break;
  }

  let winner: 0 | 1 | -1 = -1;
  const aliveA = livingCount(teams[0]);
  const aliveB = livingCount(teams[1]);
  if (aliveA > 0 && aliveB === 0) winner = 0;
  else if (aliveB > 0 && aliveA === 0) winner = 1;
  else if (sim.round >= MAX_ROUNDS) {
    // judges' decision: whoever has a larger fraction of grit left
    const frac = (team: Fighter[]): number =>
      team.reduce((acc, f) => acc + f.hp / Math.max(1, f.maxHp), 0);
    const fa = frac(teams[0]);
    const fb = frac(teams[1]);
    winner = fa > fb ? 0 : fb > fa ? 1 : -1;
    pushEvent(sim, "end", `The Pit runs out of patience — judges' decision: ${
      winner === -1 ? "draw" : winner === 0 ? "team A" : "team B"
    }.`);
  }
  pushEvent(sim, "end", winner === 0 ? "Team A takes the bout." : winner === 1 ? "Team B takes the bout." : "The bout is a draw.");

  const survivorHp: [number, number] = [
    teams[0].reduce((a, f) => a + Math.max(0, f.hp), 0),
    teams[1].reduce((a, f) => a + Math.max(0, f.hp), 0),
  ];
  const survivors = fighters
    .filter((f) => f.alive)
    .map((f) => ({ team: f.team, name: f.dog.name, hp: f.hp, maxHp: f.maxHp }));

  return {
    winner,
    rounds: sim.round,
    events: sim.events,
    logHash: hashLog(sim.events),
    survivorHp,
    survivors,
  };
}

export function hashLog(events: BattleEvent[]): string {
  // stable, order-sensitive hash of the event stream
  const text = events
    .map((e) => `${e.round}|${e.kind}|${e.actor ?? ""}|${e.target ?? ""}|${e.text}`)
    .join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function validateKennel(dogs: Dog[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (dogs.length === 0) errors.push("kennel is empty");
  if (dogs.length > KENNEL_SIZE) errors.push(`kennel exceeds ${KENNEL_SIZE} dogs`);
  const ids = new Set<string>();
  for (const d of dogs) {
    if (ids.has(d.id)) errors.push(`duplicate dog id ${d.id}`);
    ids.add(d.id);
    if (!(d.strain in STRAINS)) errors.push(`unknown strain ${d.strain}`);
    for (const trickId of d.biteOrder) {
      if (!(trickId in TRICKS)) errors.push(`unknown trick ${trickId}`);
    }
    if (d.biteOrder.length === 0) errors.push(`${d.name} has an empty bite order`);
    const eff = effectiveStats(d);
    if (eff.grit < 4) errors.push(`${d.name} has no grit left`);
  }
  return { ok: errors.length === 0, errors };
}

/** Stable identity of a dog build — version-locked entity. */
export function dogFingerprint(dog: Dog): string {
  const eff = effectiveStats(dog);
  return [
    dog.strain,
    eff.grit,
    eff.fang,
    eff.flea,
    dog.biteOrder.join(","),
    dog.scars.map((s) => s.id).join(","),
  ].join("|");
}
