/**
 * The Bone Bracket — async league truth.
 * An 8-week season against ghost kennels with their own schedules, scars,
 * standings, and promotion/relegation across three divisions.
 */

import { fnv1a, mulberry32, rollInt } from "../engine/rng";
import {
  simulateBattle,
  type BattleResult,
  type Dog,
  type Scar,
} from "../engine/battle";
import { encodePacket, resolveBout, type Kennel, type VerdictPacket } from "../async/packets";
import { makeGhostLeague, type GhostKennel } from "./ghosts";

export const DIVISIONS = ["Sewer Division", "Bone Bracket", "Crown Pit"];
export const SEASON_WEEKS = 8;
export const GHOST_COUNT = 8;

export interface WeekResult {
  week: number;
  opponentId: string;
  opponentName: string;
  playerIsTeamA: boolean;
  winner: 0 | 1 | -1; // 0 = player, 1 = opponent
  rounds: number;
  logHash: string;
  seed: number;
  packetCode: string;
  scrapEarned: number;
}

export interface GhostWeekResult {
  week: number;
  a: string;
  b: string;
  winner: string; // ghost id or "draw"
}

export interface SeasonState {
  v: 1;
  season: number;
  division: number;
  seed: number;
  week: number;
  player: Kennel;
  ghosts: GhostKennel[];
  schedule: number[]; // ghost index per week
  playerResults: WeekResult[];
  ghostResults: GhostWeekResult[];
  scrap: number;
  done: boolean;
}

const SCARS: Scar[] = [
  { id: "chipped-fang", name: "Chipped Fang", text: "Bit something it shouldn't have.", dGrit: 0, dFang: -1, dFlea: 0 },
  { id: "limp", name: "Limp", text: "Old knee, new problems.", dGrit: 0, dFang: 0, dFlea: -1 },
  { id: "scar-tissue", name: "Scar Tissue", text: "Thicker for it.", dGrit: 2, dFang: 0, dFlea: 0 },
  { id: "missing-ear", name: "Missing Ear", text: "Hears the Pit better anyway.", dGrit: -2, dFang: 0, dFlea: 0 },
  { id: "renown", name: "Renown", text: "The crowd knows the name now.", dGrit: 0, dFang: 1, dFlea: 0 },
  { id: "battle-sense", name: "Battle Sense", text: "Reads the bite order before it lands.", dGrit: 0, dFang: 0, dFlea: 1 },
];

function copyKennel(kennel: Kennel): Kennel {
  return {
    v: 1,
    name: kennel.name,
    motto: kennel.motto,
    dogs: kennel.dogs.map((d) => ({
      ...d,
      biteOrder: [...d.biteOrder],
      scars: d.scars.map((s) => ({ ...s })),
    })),
  };
}

/** Round-robin schedule over ghosts (circle method), player fights schedule[week]. */
function buildSchedule(seed: number): number[] {
  const rng = mulberry32(seed >>> 0);
  const pool = Array.from({ length: GHOST_COUNT }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rollInt(rng, i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // player plays each ghost exactly once across 8 weeks
  return pool;
}

export function startSeason(player: Kennel, seasonSeed: number, division: number, season: number, scrap = 0): SeasonState {
  return {
    v: 1,
    season,
    division: Math.max(0, Math.min(DIVISIONS.length - 1, division)),
    seed: seasonSeed >>> 0,
    week: 0,
    player: copyKennel(player),
    ghosts: makeGhostLeague(seasonSeed, GHOST_COUNT),
    schedule: buildSchedule(seasonSeed),
    playerResults: [],
    ghostResults: [],
    scrap,
    done: false,
  };
}

function ghostBoutSeed(state: SeasonState, week: number, a: string, b: string): number {
  return fnv1a(`${state.seed}|${week}|${a}|${b}`);
}

function applyScarAfterBout(
  dogs: Dog[],
  won: boolean,
  rng: () => number,
): { dog: string; scar: Scar }[] {
  const applied: { dog: string; scar: Scar }[] = [];
  for (const dog of dogs) {
    const chance = won ? 0.3 : 0.55;
    if (rng() < chance) {
      const pool = won ? SCARS.filter((s) => s.dGrit >= 0 && s.dFang >= 0 && s.dFlea >= 0) : SCARS;
      const scar = pool[rollInt(rng, pool.length)];
      dog.scars = [...dog.scars, scar];
      applied.push({ dog: dog.name, scar });
    }
  }
  return applied;
}

export interface PlayWeekOutcome {
  state: SeasonState;
  result: BattleResult;
  packet: VerdictPacket;
  packetCode: string;
  scarred: { dog: string; scar: Scar }[];
}

export function playWeek(prev: SeasonState): PlayWeekOutcome {
  if (prev.done) throw new Error("season is over — start the next one");
  const state: SeasonState = {
    ...prev,
    player: copyKennel(prev.player),
    ghosts: prev.ghosts.map((g) => ({ ...g, kennel: copyKennel(g.kennel) })),
    playerResults: [...prev.playerResults],
    ghostResults: [...prev.ghostResults],
  };
  const week = state.week;
  const opponentIdx = state.schedule[week];
  const opponent = state.ghosts[opponentIdx];

  const { result, packet } = resolveBout(state.player, opponent.kennel, state.seed + week);
  const packetCode = encodePacket(packet);
  const playerWon = result.winner === 0;
  const scrapEarned = playerWon ? 30 : result.winner === -1 ? 15 : 8;
  state.scrap += scrapEarned;

  state.playerResults.push({
    week,
    opponentId: opponent.id,
    opponentName: opponent.kennel.name,
    playerIsTeamA: true,
    winner: result.winner === 0 ? 0 : result.winner === 1 ? 1 : -1,
    rounds: result.rounds,
    logHash: result.logHash,
    seed: packet.seed,
    packetCode,
    scrapEarned,
  });

  // scars of the season: winners get renown, losers get chewed
  const rng = mulberry32(packet.seed);
  const scarred = applyScarAfterBout(state.player.dogs, playerWon, rng);
  applyScarAfterBout(opponent.kennel.dogs, !playerWon && result.winner !== -1, rng);

  // ghost league keeps playing without the player — non-live opponents have their own week
  const rest = state.ghosts.map((g) => g.id);
  const pairRng = mulberry32(ghostBoutSeed(state, week, "pair", "up"));
  const shuffled = [...rest];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rollInt(pairRng, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const a = state.ghosts.find((g) => g.id === shuffled[i]);
    const b = state.ghosts.find((g) => g.id === shuffled[i + 1]);
    if (!a || !b) continue;
    const bout = simulateBattle(
      a.kennel.dogs.slice(0, 3),
      b.kennel.dogs.slice(0, 3),
      ghostBoutSeed(state, week, a.id, b.id),
    );
    state.ghostResults.push({
      week,
      a: a.id,
      b: b.id,
      winner: bout.winner === -1 ? "draw" : bout.winner === 0 ? a.id : b.id,
    });
    // ghost scars too — their rosters evolve
    const gRng = mulberry32(bout.logHash ? fnv1a(bout.logHash) : 1);
    applyScarAfterBout(a.kennel.dogs, bout.winner === 0, gRng);
    applyScarAfterBout(b.kennel.dogs, bout.winner === 1, gRng);
  }

  state.week += 1;
  if (state.week >= SEASON_WEEKS) state.done = true;
  return { state, result, packet, packetCode, scarred };
}

export interface StandingRow {
  id: string;
  name: string;
  isPlayer: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

export function standings(state: SeasonState): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const ensure = (id: string, name: string, isPlayer: boolean): StandingRow => {
    if (!rows.has(id)) {
      rows.set(id, { id, name, isPlayer, played: 0, wins: 0, draws: 0, losses: 0, points: 0 });
    }
    return rows.get(id)!;
  };
  const playerRow = ensure("player", state.player.name, true);
  for (const g of state.ghosts) ensure(g.id, g.kennel.name, false);

  for (const r of state.playerResults) {
    const opp = ensure(r.opponentId, r.opponentName, false);
    playerRow.played += 1;
    opp.played += 1;
    if (r.winner === 0) {
      playerRow.wins += 1;
      playerRow.points += 3;
      opp.losses += 1;
    } else if (r.winner === 1) {
      opp.wins += 1;
      opp.points += 3;
      playerRow.losses += 1;
    } else {
      playerRow.draws += 1;
      opp.draws += 1;
      playerRow.points += 1;
      opp.points += 1;
    }
  }
  for (const r of state.ghostResults) {
    const a = ensure(r.a, state.ghosts.find((g) => g.id === r.a)?.kennel.name ?? r.a, false);
    const b = ensure(r.b, state.ghosts.find((g) => g.id === r.b)?.kennel.name ?? r.b, false);
    if (r.winner === "draw") {
      a.draws += 1;
      b.draws += 1;
      a.points += 1;
      b.points += 1;
    } else if (r.winner === a.id) {
      a.wins += 1;
      a.points += 3;
      b.losses += 1;
    } else {
      b.wins += 1;
      b.points += 3;
      a.losses += 1;
    }
  }

  return [...rows.values()].sort(
    (x, y) => y.points - x.points || y.wins - x.wins || Number(y.isPlayer) - Number(x.isPlayer),
  );
}

export interface SeasonClose {
  state: SeasonState;
  finalTable: StandingRow[];
  playerRank: number;
  promoted: boolean;
  relegated: boolean;
  scrapPayout: number;
  summary: string;
}

export function closeSeason(prev: SeasonState): SeasonClose {
  const table = standings(prev);
  const playerRank = table.findIndex((r) => r.isPlayer) + 1;
  const promoted = playerRank <= 2 && prev.division < DIVISIONS.length - 1;
  const relegated = playerRank >= table.length - 1 && prev.division > 0;
  const scrapPayout = Math.max(20, 120 - playerRank * 12);
  const state: SeasonState = {
    ...prev,
    division: Math.max(0, Math.min(DIVISIONS.length - 1, prev.division + (promoted ? 1 : relegated ? -1 : 0))),
    scrap: prev.scrap + scrapPayout,
  };
  return {
    state,
    finalTable: table,
    playerRank,
    promoted,
    relegated,
    scrapPayout,
    summary: `${state.player.name} finishes #${playerRank} in ${DIVISIONS[prev.division]} — ${
      promoted ? "promoted" : relegated ? "relegated" : "holds the line"
    }.`,
  };
}

/** Next season rolls forward with fresh ghosts and carried scars + scrap. */
export function nextSeason(prev: SeasonState): SeasonState {
  return startSeason(
    prev.player,
    fnv1a(`season|${prev.season + 1}|${prev.seed}`),
    prev.division,
    prev.season + 1,
    prev.scrap,
  );
}
