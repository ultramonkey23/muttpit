import type { BattleEvent, Dog } from "./engine/battle";

export type Team = 0 | 1;

export interface FighterRef {
  team: Team;
  slot: number;
}

export function findFighter(teams: [Dog[], Dog[]], name: string): FighterRef | null {
  for (const team of [0, 1] as const) {
    const idx = teams[team].findIndex((d) => d.name === name);
    if (idx >= 0) return { team, slot: idx };
  }
  return null;
}

export function parseDamage(text: string): number | null {
  const m = text.match(/takes (\d+)/);
  return m ? Number(m[1]) : null;
}

export type FeedbackKind =
  | "trick"
  | "hit"
  | "death"
  | "shield"
  | "dodge"
  | "heal"
  | "status"
  | "none";

export interface EventFeedback {
  kind: FeedbackKind;
  damage: number | null;
  actor: FighterRef | null;
  target: FighterRef | null;
}

export function eventFeedback(ev: BattleEvent, teams: [Dog[], Dog[]]): EventFeedback {
  const actor = ev.actor ? findFighter(teams, ev.actor) : null;
  const target = ev.target ? findFighter(teams, ev.target) : null;
  let kind: FeedbackKind = "none";
  if (ev.kind === "trick") kind = "trick";
  else if (ev.kind === "death") kind = "death";
  else if (ev.kind === "heal") kind = "heal";
  else if (ev.kind === "status") {
    if (/plays dead/.test(ev.text)) kind = "dodge";
    else if (/shield eats/.test(ev.text)) kind = "shield";
    else kind = "status";
  } else if (ev.kind === "hit") kind = "hit";
  return { kind, damage: parseDamage(ev.text), actor, target };
}

export function eventDelay(prev: BattleEvent | null, next: BattleEvent | null): number {
  if (!next) return 400;
  let base = 340;
  switch (next.kind) {
    case "trick": base = 480; break;
    case "hit": base = 220; break;
    case "death": base = 950; break;
    case "status": base = 360; break;
    case "heal": base = 360; break;
    case "start": base = 400; break;
    case "end": base = 520; break;
    default: base = 340;
  }
  if (prev && next && next.round !== prev.round) base += 520;
  return base;
}
