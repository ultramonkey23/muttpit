# MUTTPIT — Design Truth

> Owned by: Ultramonkeydog Studios game repo. The Lab reads this; it never becomes a runtime dependency.

**One line:** Draft mongrels, write their bite order, mail your kennel into the Pit — every verdict keeps its receipts.

## Cody constraint surface (protected)

- Inspiration *Batomon* (async PvP, collection, leagues) x *Hearthstone Battlegrounds* (auto-battle, draft, positioning) — transmuted, never cloned.
- Async / non-live PvP and leagues are **real systems**, not menu labels.
- Distinctly Ultramonkeydog/Cody in mechanics, tone, systems.
- Complete playable browser build < 25 MB (measured).
- Publishable on Ultramonkeydog Studios website (static hosting, no backend).

## Recovered creative DNA (from Lab project registry + creator memory)

| Source | DNA taken |
| --- | --- |
| Box o' Battles | Permanence over spectacle; every verdict traceable to an auditable, deterministic battle log + replay hash. Version-locked entities: a dog is an exact build. |
| Bone League | Covenant/attrition rosters: scars and stamina carry across a season; tense, readable tactical episodes. |
| Savage Crown | Creature identity is gameplay: strains and scars change what a dog *is*, not its cosmetic skin. |
| What We Fed | Bond/consequence weight; honest moral texture. Quig speaks of the creator only as "the monkeydog". |
| Studios | Brutal/pixel/comic material language; bone-rust-gold-cyan-violet-lime-pink palette; hook first, proof second; honest incompleteness. |
| Grave Idol memory | Explicit priority + strict output contracts + smoke tests; capability minimalism. |

## The game

**Framing:** The Pit is a scrap-fighting league for mongrels — dogs, grems, bonehounds and worse — where fights are *mailed in*. You never fight live. You build a Kennel, write each dog's **Bite Order**, and post your challenge code. The Pit resolves bouts deterministically and issues a **Verdict Packet** both sides can audit. The Pit keeps the receipts.

### Core loop

1. **Kennel** — roster of up to 4 mongrels. Each dog: Strain, stats (GRIT / FANG / FLEA), and a Bite Order (queue of up to 4 Tricks, played cyclically).
2. **The Pound** — draft new dogs / new Tricks from rotating offers (Batomon collection pressure, BG-style economy via Scrap).
3. **Bout** — 3v3 auto-battle. Positioning (front/mid/back) matters: front-most dog takes the hits unless a Trick says otherwise. Deterministic seeded resolution, animated from the event log.
4. **Async PvP** — export your **Kennel Code** (shareable), import an opponent's code, resolve instantly, export a **Verdict Packet** (code + seed + log hash + summary) to mail back. No server, no lies: the packet replays identically on any machine.
5. **League** — the **Bone Bracket**: an 8-week season against procedurally drafted ghost kennels with personalities. Weekly bouts, scars between weeks, standings, promotion/relegation across divisions (Sewer → Bone → Crown Pit), Scrap payouts. Ghosts draft and improve on their own schedules — non-live PvP against recorded behavior.

### Combat grammar (auditable by design)

- Deterministic mulberry32 RNG seeded from hash(attackerCode, defenderCode, seed).
- Tick-based initiative from FLEA. On its tick a dog plays the next Trick in its Bite Order (fallback: SNAP).
- Statuses: BLEED, SHIELD, RAGE, COWER, MARKED, DODGE. Front-position targeting with explicit BACKSTAB-family exceptions.
- Every bout emits a full event log and a replay hash; a Verdict Packet is only trustworthy because it can be re-derived.

### Tone

Street-courtroom comic brutalism. The Pit speaks like a boxing promoter with a filing obsession. "Honest incompleteness" is in-voice: what is not finished is said out loud.

## Tech truth

- TypeScript + Vite, zero runtime dependencies. Static `dist/` suitable for the Studios site (iframe or direct hosting).
- Pure engine (`src/engine`, `src/league`, `src/async`) — no DOM imports; tested with vitest.
- All art procedural (SVG/CSS from dog hashes) — no binary assets, no image generation.
- Size budget: `npm run size` measures `dist/` and fails at >= 25 MB.

## Field truth: balance & progression (measured, not vibed)

- The Pit measures its own field: `runBalanceReport` (src/league/balance.ts) round-robins 6 strain + 5 personality archetypes over fixed seeds. Tests gate **all three** lanes to win rates in 0.25–0.75: strains vs the whole field, strains vs the isolated strain field, and personalities vs the whole field. Field truth at the D2a retune: strains 0.367–0.700 vs field / 0.267–0.733 isolated; personalities 0.383–0.467. Personality archetypes share one fixed chassis trio (mongrel/bonehound/cur) so ALLOC + bite-order prefs are the personality variable, not mono-chassis base stacking.
- Balance data, not math: the retune adjusts three strain bases — grem 9→10 GRIT, pupp 9→10 GRIT, bonehound 12/6/3→11/5/4 — and strain bench 3's bite order swaps cower→maul so every strain line carries real damage. The battle formulas never changed.
- Trait truth: grem **VOLATILE** (+2 FANG when bloodied) fires at 75% GRIT — the old 50% threshold almost never triggered because dogs die first. `tests/volatile.test.ts` pins a measured trigger-rate floor.
- Progression heat: the Pound's offers roll richer as a career deepens — offer budgets gain `min(6, (season-1) + division)` stat points. Season 1 Sewer drafts are scrappy; Crown Pit season 4 drafts are monsters.
- Ghost pressure (measured by `tests/ghost-ladder.test.ts`, 40 seeded ghost leagues per level, untouched starter trio vs ghost lineups): the starter trio wins 0.55-0.75 of its bouts at ghost pressure 0, the win rate falls monotonically on every rung of the ladder, and sits at or below 0.35 at pressure 6 (Crown Pit, late seasons) — promotion is a harder Pit that rewards improving the kennel. No ghost personality is a free win: starter win rate vs each personality at pressure 0 stays at or below 0.85. Mechanism: every ghost dog gets a stat budget of `9 + round(skill*6) + 2 (front dog) + round(pressure*1.25)` points, spread grit/fang/flea by personality flavor weights (ALLOC), with at least one closing bite in every bite order.
- Reorderable bite orders are the core toy: every dog's trick queue is editable (move/remove) because "write their bite order" is the pitch, not a tooltip.
