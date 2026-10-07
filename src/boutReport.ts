/**
 * MUTTPIT bout readout — turns a finished BattleResult into plain facts about who did what.
 *
 * Pure module: no DOM, no clock, no entropy. It reads only the existing event log (plus the
 * two lineups, for names/strains/bite orders) and never touches engine math, event text or
 * the log hash. Notes state what the log shows; they never name a better move.
 *
 * Contract relied on from src/engine/battle.ts:
 *  - every event carries an `hp` snapshot keyed `${team}:${dogName}`, and every hp change is
 *    followed by an event before the next change, so snapshot deltas give exact effective
 *    damage / healing (overkill and overheal are not counted);
 *  - events are tied to dogs by name (`actor` / `target`), a bout lineup is the first
 *    LINEUP_SIZE dogs of each kennel, and a dog's n-th trick is biteOrder[(n-1) % length]
 *    (an empty order plays "snap");
 *  - a trick's consequences are the events after its `trick` event, up to the next one,
 *    except bleed ticks, which are logged at the start of the bleeding dog's own turn.
 * Where the log cannot pin a fact to one dog (two dogs sharing a name), `exact` turns false.
 */

import { LINEUP_SIZE, TRICKS } from "./engine/content";
import type { BattleEvent, BattleResult, Dog } from "./engine/battle";

export type Side = 0 | 1;

export interface SlotReport {
  /** index into the dog's bite order (0-based) */
  index: number;
  trickId: string;
  trickName: string;
  plays: number;
  /** effective damage this slot's plays took off enemies */
  damage: number;
  /** effective grit this slot's plays restored */
  healing: number;
  /** status / shield / bleed events this slot's plays produced */
  statuses: number;
  /** hits eaten by a shield, dodged, or shrugged off by a strain trait */
  blocked: number;
}

export interface DogReport {
  team: Side;
  slot: number;
  id: string;
  name: string;
  strain: Dog["strain"];
  startHp: number;
  endHp: number;
  /** effective damage from this dog's bites (bleed ticks are not credited to anyone) */
  damageDealt: number;
  /** effective grit lost to bites and bleeding */
  damageTaken: number;
  /** the part of damageTaken that came from bleeding */
  bleedTaken: number;
  /** damage eaten by this dog's shield */
  shieldAbsorbed: number;
  /** effective grit this dog restored (to itself or allies) */
  healingDone: number;
  /** effective grit this dog got back from any healer */
  healingReceived: number;
  kos: number;
  tricksPlayed: number;
  /** status / shield / bleed events this dog's tricks produced */
  statusPlays: number;
  /** round this dog went down, or null if it was still up at the end */
  downRound: number | null;
  /** name of the dog that landed the killing bite; null for bleed-outs and survivors */
  downBy: string | null;
  slots: SlotReport[];
}

export interface TeamTotals {
  damageDealt: number;
  damageTaken: number;
  bleedTaken: number;
  shieldAbsorbed: number;
  healingDone: number;
  kos: number;
}

export type NoteKind =
  | "turning-point"
  | "first-ko"
  | "judged"
  | "carried"
  | "no-damage"
  | "dead-slot";

export interface PitNote {
  kind: NoteKind;
  /** the side the note is about, or null when it concerns the whole bout */
  team: Side | null;
  round: number | null;
  /** the dog the note is about, when there is one */
  subject: { team: Side; slot: number } | null;
  text: string;
}

export interface BoutReport {
  winner: 0 | 1 | -1;
  rounds: number;
  /** both lineups, as fought, in slot order */
  dogs: [DogReport[], DogReport[]];
  totals: [TeamTotals, TeamTotals];
  notes: PitNote[];
  /** false when two dogs share a name or the log disagrees with the lineups */
  exact: boolean;
}

const BLEED_TICK = / bleeds for \d+\.$/;
const BLEED_OUT = / bleeds out\.$/;
const WHIFF = / plays dead — the hit whiffs\.$/;
const SHIELD_EATS = /'s shield eats (\d+)\.$/;
const SHRUG = / shrugs 2 off /;
const APPLIED = / starts bleeding\.$| gains [A-Z]+ \d+\.$/;

const MAX_NOTES_PER_KIND = 2;
const CARRY_SHARE = 0.6;

function teamLabel(team: Side): string {
  return team === 0 ? "Team A" : "Team B";
}

function other(team: Side): Side {
  return team === 0 ? 1 : 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

interface Change {
  team: Side;
  name: string;
  delta: number;
}

/** hp-snapshot keys that moved between two events */
function changesBetween(prev: Record<string, number> | undefined, next: Record<string, number> | undefined): Change[] {
  const out: Change[] = [];
  if (!prev || !next) return out;
  for (const key of Object.keys(next)) {
    const delta = next[key] - (prev[key] ?? next[key]);
    if (delta === 0) continue;
    const cut = key.indexOf(":");
    const team = key.slice(0, cut) === "0" ? 0 : 1;
    out.push({ team, name: key.slice(cut + 1), delta });
  }
  return out;
}

function blankTotals(): TeamTotals {
  return { damageDealt: 0, damageTaken: 0, bleedTaken: 0, shieldAbsorbed: 0, healingDone: 0, kos: 0 };
}

export function summarizeBout(result: BattleResult, teams: [Dog[], Dog[]]): BoutReport {
  let exact = true;
  const lineups: [Dog[], Dog[]] = [teams[0].slice(0, LINEUP_SIZE), teams[1].slice(0, LINEUP_SIZE)];
  const events: BattleEvent[] = result.events;

  const dogs: [DogReport[], DogReport[]] = [[], []];
  const byName = new Map<string, DogReport[]>();
  ([0, 1] as Side[]).forEach((team) => {
    lineups[team].forEach((dog, slot) => {
      const order = dog.biteOrder.length > 0 ? dog.biteOrder : ["snap"];
      const report: DogReport = {
        team,
        slot,
        id: dog.id,
        name: dog.name,
        strain: dog.strain,
        startHp: 0,
        endHp: 0,
        damageDealt: 0,
        damageTaken: 0,
        bleedTaken: 0,
        shieldAbsorbed: 0,
        healingDone: 0,
        healingReceived: 0,
        kos: 0,
        tricksPlayed: 0,
        statusPlays: 0,
        downRound: null,
        downBy: null,
        slots: order.map((trickId, index) => ({
          index,
          trickId,
          trickName: (TRICKS[trickId] ?? TRICKS.snap).name,
          plays: 0,
          damage: 0,
          healing: 0,
          statuses: 0,
          blocked: 0,
        })),
      };
      dogs[team].push(report);
      const list = byName.get(dog.name) ?? [];
      list.push(report);
      byName.set(dog.name, list);
    });
  });

  // names the log cannot tell apart
  for (const list of byName.values()) {
    if (list.length > 1) exact = false;
  }

  // starting and final grit come straight from the hp snapshots
  const first = events[0]?.hp;
  const last = events[events.length - 1]?.hp;
  for (const team of [0, 1] as Side[]) {
    for (const d of dogs[team]) {
      const key = `${team}:${d.name}`;
      if (first && key in first) d.startHp = first[key];
      else exact = false;
      if (last && key in last) d.endHp = last[key];
    }
  }

  const dogAt = (team: Side, name: string): DogReport | undefined =>
    dogs[team].find((d) => d.name === name);

  // per-event hp movement
  const moves: Change[][] = events.map((e, i) => (i === 0 ? [] : changesBetween(events[i - 1].hp, e.hp)));

  // find which side a trick window belongs to
  const trickIdx: number[] = [];
  events.forEach((e, i) => {
    if (e.kind === "trick") trickIdx.push(i);
  });

  const isTickEvent = (e: BattleEvent): boolean =>
    (e.kind === "hit" && BLEED_TICK.test(e.text)) || (e.kind === "death" && BLEED_OUT.test(e.text));

  const windowEnd = (n: number): number => (n + 1 < trickIdx.length ? trickIdx[n + 1] : events.length);

  const windowActor = (n: number): DogReport | undefined => {
    const start = trickIdx[n];
    const name = events[start].actor;
    if (name === undefined) return undefined;
    const named = byName.get(name) ?? [];
    const sides = new Set(named.map((d) => d.team));
    if (sides.size === 1) return named[0];
    if (sides.size === 0) return undefined;
    // two sides share the name: read the side off what the trick visibly did
    for (let i = start; i < windowEnd(n); i++) {
      const e = events[i];
      if (isTickEvent(e) || e.actor !== name) continue;
      for (const c of moves[i]) {
        if (e.kind === "hit" && c.name === e.target && c.delta < 0) return dogAt(other(c.team), name);
        if (e.kind === "heal" && c.name === e.target && c.delta > 0) return dogAt(c.team, name);
      }
    }
    return undefined;
  };

  const downed = new Set<DogReport>();
  const targetDog = (i: number, actor: DogReport | undefined, wantDamage: boolean): DogReport | undefined => {
    const e = events[i];
    if (e.target === undefined) return undefined;
    const named = byName.get(e.target) ?? [];
    const sides = new Set(named.map((d) => d.team));
    if (sides.size === 1) return named[0];
    if (sides.size === 0) return undefined;
    const moved = moves[i].filter((c) => c.name === e.target && (wantDamage ? c.delta < 0 : c.delta > 0));
    if (moved.length === 1) return dogAt(moved[0].team, e.target);
    if (actor) return dogAt(other(actor.team), e.target);
    return undefined;
  };

  trickIdx.forEach((start, n) => {
    const actor = windowActor(n);
    const end = windowEnd(n);
    const trickEvent = events[start];
    if (!actor) {
      exact = false;
      return;
    }
    const slot = actor.slots[actor.tricksPlayed % actor.slots.length];
    actor.tricksPlayed += 1;
    slot.plays += 1;
    // the logged trick must be the one the lineup's bite order says comes next
    if (trickEvent.text !== `${actor.name} plays ${slot.trickName}.`) exact = false;

    for (let i = start + 1; i < end; i++) {
      const e = events[i];
      if (e.kind === "start" || e.kind === "end" || isTickEvent(e)) continue;
      if (e.actor !== actor.name) continue;

      if (e.kind === "hit") {
        const victim = targetDog(i, actor, true);
        const hurt = moves[i].find(
          (c) => c.name === e.target && c.delta < 0 && (!victim || c.team === victim.team),
        );
        if (!victim || !hurt) {
          exact = false;
          continue;
        }
        const dmg = -hurt.delta;
        actor.damageDealt += dmg;
        slot.damage += dmg;
        victim.damageTaken += dmg;
      } else if (e.kind === "heal") {
        const patient = targetDog(i, actor, false);
        const mended = moves[i].find(
          (c) => c.name === e.target && c.delta > 0 && (!patient || c.team === patient.team),
        );
        const gain = mended ? mended.delta : 0;
        if (patient) patient.healingReceived += gain;
        actor.healingDone += gain;
        slot.healing += gain;
      } else if (e.kind === "death") {
        const victim = targetDog(i, actor, true);
        if (victim && e.actor !== undefined && victim.team !== actor.team) {
          actor.kos += 1;
          victim.downBy = actor.name;
        }
      } else if (e.kind === "status") {
        const eaten = SHIELD_EATS.exec(e.text);
        if (eaten) {
          const holder = targetDog(i, actor, true);
          if (holder) holder.shieldAbsorbed += Number(eaten[1]);
          else exact = false;
          slot.blocked += 1;
        } else if (WHIFF.test(e.text) || SHRUG.test(e.text)) {
          slot.blocked += 1;
        } else if (APPLIED.test(e.text)) {
          slot.statuses += 1;
          actor.statusPlays += 1;
        }
      }
    }
  });

  // grit lost to bleeding, and who went down when
  events.forEach((e, i) => {
    if (e.kind === "hit" && BLEED_TICK.test(e.text) && e.target !== undefined) {
      const moved = moves[i].find((c) => c.name === e.target && c.delta < 0);
      const victim = moved ? dogAt(moved.team, e.target) : undefined;
      if (!moved || !victim) {
        exact = false;
        return;
      }
      victim.damageTaken += -moved.delta;
      victim.bleedTaken += -moved.delta;
    } else if (e.kind === "death" && e.target !== undefined) {
      const named = byName.get(e.target) ?? [];
      const candidates = named.filter((d) => !downed.has(d) && (e.hp?.[`${d.team}:${d.name}`] ?? 1) === 0);
      const victim = candidates[0];
      if (!victim) {
        exact = false;
        return;
      }
      downed.add(victim);
      victim.downRound = e.round;
    }
  });

  const totals: [TeamTotals, TeamTotals] = [blankTotals(), blankTotals()];
  for (const team of [0, 1] as Side[]) {
    for (const d of dogs[team]) {
      const t = totals[team];
      t.damageDealt += d.damageDealt;
      t.damageTaken += d.damageTaken;
      t.bleedTaken += d.bleedTaken;
      t.shieldAbsorbed += d.shieldAbsorbed;
      t.healingDone += d.healingDone;
      t.kos += d.kos;
    }
  }

  const notes = buildNotes(result, dogs, totals, events);
  return { winner: result.winner, rounds: result.rounds, dogs, totals, notes, exact };
}

function loserFirst(winner: 0 | 1 | -1): Side[] {
  return winner === 0 ? [1, 0] : [0, 1];
}

function buildNotes(
  result: BattleResult,
  dogs: [DogReport[], DogReport[]],
  totals: [TeamTotals, TeamTotals],
  events: BattleEvent[],
): PitNote[] {
  const notes: PitNote[] = [];
  const winner = result.winner;
  const everyDog = (): DogReport[] => [...dogs[0], ...dogs[1]];

  // the lead, measured the way the judges measure it: remaining grit as a share of starting grit
  const lead = (hp: Record<string, number>): number => {
    let diff = 0;
    for (const d of everyDog()) {
      const share = d.startHp > 0 ? (hp[`${d.team}:${d.name}`] ?? 0) / d.startHp : 0;
      diff += d.team === 0 ? share : -share;
    }
    return diff;
  };
  const roundEnd = new Map<number, Record<string, number>>();
  for (const e of events) {
    if (e.round >= 1 && e.hp) roundEnd.set(e.round, e.hp);
  }

  if (winner !== -1) {
    const winSign = winner === 0 ? 1 : -1;
    const rounds = [...roundEnd.keys()].sort((a, b) => a - b);
    let turn = -1;
    let trailed = false;
    for (const r of rounds) {
      const behind = lead(roundEnd.get(r)!) * winSign < 0;
      if (behind) {
        trailed = true;
        turn = -1;
      } else if (turn === -1) {
        turn = r;
      }
    }
    if (trailed && turn !== -1) {
      const roundDeaths = events.filter(
        (e) => e.round === turn && e.kind === "death" && e.target !== undefined,
      );
      const koDog = roundDeaths
        .map((e) => everyDog().find((d) => d.name === e.target && d.team !== winner))
        .find((d) => d !== undefined);
      const cause = koDog ? ` — ${koDog.name} went down that round` : "";
      notes.push({
        kind: "turning-point",
        team: winner,
        round: turn,
        subject: koDog ? { team: koDog.team, slot: koDog.slot } : null,
        text: `Round ${turn}: ${teamLabel(winner)} pulled ahead on remaining grit after trailing, and held it to the end${cause}.`,
      });
    }
  }

  const downs = everyDog()
    .filter((d) => d.downRound !== null)
    .sort((a, b) => a.downRound! - b.downRound! || a.team - b.team || a.slot - b.slot);
  // the log order, not the sort above, decides who fell first inside a round
  const firstDeath = events.find((e) => e.kind === "death" && e.target !== undefined);
  const firstDown =
    (firstDeath && downs.find((d) => d.name === firstDeath.target && d.downRound === firstDeath.round)) ?? downs[0];
  if (firstDown) {
    const how = firstDown.downBy ? `to ${firstDown.downBy}'s bite` : "bleeding out";
    notes.push({
      kind: "first-ko",
      team: firstDown.team,
      round: firstDown.downRound,
      subject: { team: firstDown.team, slot: firstDown.slot },
      text: `${firstDown.name} (${teamLabel(firstDown.team)}) was the first dog down — round ${firstDown.downRound}, ${how}.`,
    });
  }

  if (result.survivors.some((s) => s.team === 0) && result.survivors.some((s) => s.team === 1)) {
    notes.push({
      kind: "judged",
      team: null,
      round: result.rounds,
      subject: null,
      text: `Neither side was finished off in ${plural(result.rounds, "round", "rounds")}; the judges counted remaining grit.`,
    });
  }

  let carried = 0;
  for (const team of loserFirst(winner)) {
    const total = totals[team].damageDealt;
    if (total <= 0 || dogs[team].length < 2 || carried >= MAX_NOTES_PER_KIND) continue;
    const top = dogs[team].reduce((a, b) => (b.damageDealt > a.damageDealt ? b : a));
    if (top.damageDealt / total < CARRY_SHARE) continue;
    carried += 1;
    notes.push({
      kind: "carried",
      team,
      round: null,
      subject: { team, slot: top.slot },
      text: `${top.name} dealt ${top.damageDealt} of ${teamLabel(team)}'s ${total} damage (${Math.round((top.damageDealt / total) * 100)}%).`,
    });
  }

  let idle = 0;
  for (const team of loserFirst(winner)) {
    if (dogs[team].length < 2) continue;
    for (const d of dogs[team]) {
      if (idle >= MAX_NOTES_PER_KIND) break;
      if (d.tricksPlayed === 0 || d.damageDealt > 0) continue;
      idle += 1;
      const extras: string[] = [];
      if (d.healingDone > 0) extras.push(`healed ${d.healingDone}`);
      if (d.statusPlays > 0) extras.push(plural(d.statusPlays, "status play", "status plays"));
      const tail = extras.length > 0 ? ` (${extras.join(", ")})` : "";
      notes.push({
        kind: "no-damage",
        team,
        round: null,
        subject: { team, slot: d.slot },
        text: `${d.name} (${teamLabel(team)}) played ${plural(d.tricksPlayed, "trick", "tricks")} and never landed a bite${tail}.`,
      });
    }
  }

  let dead = 0;
  for (const team of loserFirst(winner)) {
    for (const d of dogs[team]) {
      for (const s of d.slots) {
        if (dead >= MAX_NOTES_PER_KIND) break;
        if (s.plays === 0 || s.damage > 0 || s.healing > 0 || s.statuses > 0) continue;
        dead += 1;
        const blocked = s.blocked > 0 ? `, blocked ${s.blocked}×` : "";
        notes.push({
          kind: "dead-slot",
          team,
          round: null,
          subject: { team, slot: d.slot },
          text: `${d.name}'s bite ${s.index + 1} (${s.trickName}) played ${s.plays}× and landed no damage, healing or status${blocked}.`,
        });
      }
    }
  }

  return notes;
}
