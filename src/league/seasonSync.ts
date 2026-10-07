/**
 * The kennel the player edits is the one truth; a season fights it as it stands.
 *
 * startSeason snapshots the kennel, and every week used to fight that frozen
 * snapshot: lineup moves, bite-order edits, purchases and releases made after
 * "Start Season" never reached a bout, scars landed on the snapshot instead of
 * the player's dogs, and the snapshot's scrap overwrote what the Pound had
 * already taken (Cody's playtest, 2026-10-07). These two seams keep the season
 * and the kennel in step without changing league or engine math.
 */

import type { Kennel } from "../async/packets";
import type { SeasonState } from "./season";

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

/** The season as it should fight this week: the player's current kennel and scrap. */
export function withCurrentKennel(state: SeasonState, kennel: Kennel, scrap: number): SeasonState {
  return { ...state, player: copyKennel(kennel), scrap };
}

/** Scars the Pit signed during the season belong on the player's own dogs (matched by id). */
export function scarsBackToKennel(kennel: Kennel, state: SeasonState): void {
  for (const dog of kennel.dogs) {
    const fought = state.player.dogs.find((d) => d.id === dog.id);
    if (fought) dog.scars = fought.scars.map((s) => ({ ...s }));
  }
}
