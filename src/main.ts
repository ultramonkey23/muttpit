/**
 * MUTTPIT — the game shell.
 * Street-courtroom comic brutalism: hook first, receipts second, honest incompleteness always.
 */

import "./style.css";
import { dogSvg, pawSvg } from "./art";
import { STRAINS, TRICKS, LINEUP_SIZE, type StrainId } from "./engine/content";
import type { BattleResult, Dog, Scar } from "./engine/battle";
import { fnv1a } from "./engine/rng";
import type { Kennel, VerdictPacket } from "./async/packets";
import {
  auditPacket,
  decodeKennel,
  encodeKennel,
  encodePacket,
  resolveBout,
} from "./async/packets";
import {
  DIVISIONS,
  SEASON_WEEKS,
  closeSeason,
  nextSeason,
  playWeek,
  startSeason,
  standings,
  type SeasonClose,
  type SeasonState,
} from "./league/season";
import { DOG_PRICE, TRICK_PRICE, poundOffers, teachTrick } from "./league/pound";

// ---------------------------------------------------------------- state

type Screen = "title" | "kennel" | "pound" | "league" | "mailbox" | "bout";

interface MailEntry {
  kind: "sent-verdict" | "challenge" | "audit";
  label: string;
  code: string;
  ok: boolean;
  note: string;
}

interface Save {
  v: 1;
  kennel: Kennel;
  scrap: number;
  division: number;
  season: number;
  seasonState: SeasonState | null;
  lastClose: SeasonClose | null;
  mail: MailEntry[];
  poundSeed: number;
  boutCounter: number;
}

interface Bout {
  result: BattleResult;
  teamNames: [string, string];
  teams: [Dog[], Dog[]];
  idx: number;
  playing: boolean;
  timer: number | null;
  packetCode: string;
  label: string;
  returnScreen: Screen;
  scarred: { dog: string; scar: Scar }[];
  record?: { kind: MailEntry["kind"]; label: string };
}

const SAVE_KEY = "muttpit.save.v1";
const app = document.getElementById("app")!;

let save: Save | null = loadSave();
let screen: Screen = save ? "kennel" : "title";
let bout: Bout | null = null;
let msg = "";
let teachTarget: string | null = null;
// mailbox drafts survive re-renders (a Quig toast must not eat pasted mail)
const drafts = { oppCode: "", oppPacket: "" };

function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Save;
    return parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function store(): void {
  if (save) localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function say(text: string): void {
  msg = text;
}

const QUIG_LINES = [
  'Quig: "The monkeydog built the Pit. The Pit keeps the receipts."',
  'Quig: "A real Muttpit is worth more than a fake Batomon."',
  'Quig: "Scars are just stats the Pit signed."',
  'Quig: "Mail your kennel. Let the verdict travel."',
  'Quig: "What is not finished, the Pit will tell you."',
  'Quig: "Every dog is a build. Never a vibe."',
];

function quigLine(): string {
  const i = (save?.boutCounter ?? 0) % QUIG_LINES.length;
  return QUIG_LINES[i];
}

// ---------------------------------------------------------------- careers

function starterKennel(): Kennel {
  return {
    v: 1,
    name: "Bucket Kennels",
    motto: "Lose small. Scar big.",
    dogs: [
      mk("Big Sad", "brute", 2, 3, 1, ["maul", "cower", "snap"]),
      mk("Nubbins", "grem", 1, 4, 3, ["flurry", "mudtoss"]),
      mk("Pockets", "cur", 2, 2, 2, ["fleabite", "sic", "snap"]),
      mk("Wobbles", "mongrel", 3, 2, 3, ["packpounce", "howl"]),
    ],
  };
}

function mk(name: string, strain: StrainId, grit: number, fang: number, flea: number, order: string[]): Dog {
  return {
    id: `${name.toLowerCase().replace(/\W+/g, "-")}-${fnv1a(name + strain) % 9973}`,
    name,
    strain,
    grit,
    fang,
    flea,
    biteOrder: order,
    scars: [],
  };
}

function newCareer(): void {
  save = {
    v: 1,
    kennel: starterKennel(),
    scrap: 150,
    division: 0,
    season: 1,
    seasonState: null,
    lastClose: null,
    mail: [],
    poundSeed: 1,
    boutCounter: 0,
  };
  store();
  screen = "kennel";
  say("Career opened. The Pound is already open.");
}

// ---------------------------------------------------------------- battles

function startBout(
  result: BattleResult,
  teamNames: [string, string],
  teams: [Dog[], Dog[]],
  packetCode: string,
  label: string,
  returnScreen: Screen,
  scarred: { dog: string; scar: Scar }[] = [],
  record?: Bout["record"],
): void {
  bout = {
    result,
    teamNames,
    teams,
    idx: 0,
    playing: true,
    timer: null,
    packetCode,
    label,
    returnScreen,
    scarred,
    record,
  };
  screen = "bout";
  if (save) {
    save.boutCounter += 1;
    store();
  }
  runTimer();
}

function runTimer(): void {
  if (bout?.timer) window.clearInterval(bout.timer);
  bout!.timer = window.setInterval(() => {
    if (!bout) return;
    if (!bout.playing) return;
    if (bout.idx >= bout.result.events.length) {
      finishBoutPlayback();
      return;
    }
    bout.idx += 1;
    render();
  }, 340);
}

function finishBoutPlayback(): void {
  if (!bout) return;
  bout.playing = false;
  if (bout.timer) window.clearInterval(bout.timer);
  bout.timer = null;
  if (bout.record && save) {
    const won = bout.result.winner === 0;
    save.mail.unshift({
      kind: bout.record.kind,
      label: bout.record.label,
      code: bout.packetCode,
      ok: won || bout.result.winner === -1,
      note: `verdict: ${won ? "your kennel" : bout.teamNames[1]} took it — log ${bout.result.logHash}`,
    });
    save.mail = save.mail.slice(0, 30);
    store();
  }
  render();
}

function currentHp(eventIdx: number, team: number, name: string, fallback: number): number {
  if (eventIdx <= 0) return fallback;
  const ev = bout!.result.events[Math.min(eventIdx, bout!.result.events.length) - 1];
  const key = `${team}:${name}`;
  return ev?.hp && key in ev.hp ? ev.hp[key] : fallback;
}

// ---------------------------------------------------------------- render

function render(): void {
  const body =
    screen === "title" ? viewTitle() :
    screen === "kennel" ? viewKennel() :
    screen === "pound" ? viewPound() :
    screen === "league" ? viewLeague() :
    screen === "mailbox" ? viewMailbox() :
    viewBout();

  const nav =
    screen === "title" || screen === "bout"
      ? ""
      : `<div class="navbar">
      <button class="btn small secondary" data-act="goto" data-screen="kennel">Kennel</button>
      <button class="btn small secondary" data-act="goto" data-screen="pound">Pound</button>
      <button class="btn small secondary" data-act="goto" data-screen="league">Bone Bracket</button>
      <button class="btn small secondary" data-act="goto" data-screen="mailbox">Mailbox</button>
      <span style="flex:1"></span>
      <span class="scrap-counter">${save?.scrap ?? 0} SCRAP</span>
    </div>`;

  app.innerHTML = `
    ${nav}
    ${msg ? `<div class="panel rust"><b>${esc(msg)}</b> <button class="btn small" data-act="dismiss">ok</button></div>` : ""}
    ${body}
    <div class="quig">${esc(quigLine())} <span style="opacity:.6">v0.1 — what is not finished, the Pit will tell you.</span></div>
  `;
}

function viewTitle(): string {
  return `
    <h1 class="title-logo display">MUTTPIT</h1>
    <div class="title-sub">async scrap-league auto-battler · draft · mail · verdict</div>
    <div class="panel bone">
      <p><b>Draft mongrels, write their bite order, mail your kennel into the Pit —
      every verdict keeps its receipts.</b></p>
      <p style="margin-top:8px">Built for Ultramonkeydog Studios.
      Non-live PvP by kennel codes and auditable verdict packets. Leagues are real seasons with scars.</p>
      <div class="btnrow">
        ${save ? `<button class="btn lime" data-act="continue">Continue — ${esc(save.kennel.name)}</button>` : ""}
        <button class="btn" data-act="new-game">New Kennel</button>
      </div>
    </div>
    <div class="panel">
      <span class="tag violet">how it works</span>
      <p style="margin-top:8px">1. Your kennel holds up to 4 dogs; the first ${LINEUP_SIZE} fight the Bout.
      2. Each dog carries a bite order of tricks played cyclically.
      3. Bouts resolve deterministically from a seed — the log hash is the receipt.
      4. Play the 8-week Bone Bracket against ghost kennels, or mail codes to a human.</p>
    </div>`;
}

function viewKennel(): string {
  if (!save) return viewTitle();
  const k = save.kennel;
  const dogCards = k.dogs
    .map((d, i) => {
      const eff = STRAINS[d.strain];
      return `
      <div class="dogcard">
        ${dogSvg(d, 220)}
        <div class="name display">${esc(d.name)} ${i < LINEUP_SIZE ? '<span class="tag lime">lineup</span>' : '<span class="tag">bench</span>'}</div>
        <div class="mono-sm">${esc(eff.name)} — ${esc(eff.trait)}</div>
        <div class="stats">
          <span class="chip grit">GRIT ${eff.base.grit + d.grit + d.scars.reduce((s, x) => s + x.dGrit, 0)}</span>
          <span class="chip fang">FANG ${eff.base.fang + d.fang + d.scars.reduce((s, x) => s + x.dFang, 0)}</span>
          <span class="chip flea">FLEA ${eff.base.flea + d.flea + d.scars.reduce((s, x) => s + x.dFlea, 0)}</span>
        </div>
        <div class="order-list">${d.biteOrder.map((t, ti) => `<span class="chip trick" title="${esc(TRICKS[t]?.text ?? t)}">${ti + 1}. ${esc(TRICKS[t]?.name ?? t)}</span>`).join("")}</div>
        ${d.scars.length ? `<div class="scarline">scars: ${d.scars.map((s) => esc(s.name)).join(", ")}</div>` : ""}
        <div class="btnrow">
          <button class="btn small secondary" data-act="dog-up" data-i="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn small secondary" data-act="dog-down" data-i="${i}" ${i === k.dogs.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn small danger" data-act="dog-release" data-i="${i}">release</button>
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="panel gold">
      <h2>${esc(k.name)} ${pawSvg("#120c08")}</h2>
      <p>"${esc(k.motto)}"</p>
      <div class="btnrow">
        <button class="btn small secondary" data-act="rename">rename</button>
        <span class="tag cyan">${esc(DIVISIONS[save.division])}</span>
        <span class="tag pink">season ${save.season}</span>
      </div>
    </div>
    <div class="doggrid">${dogCards}</div>
    <div class="panel">
      <span class="tag violet">the pit says</span>
      <p style="margin-top:8px">Lineup is the first ${LINEUP_SIZE} dogs — order is destiny. Move dogs with ↑↓.
      The Pound sells fresh mongrels and trick lessons. The Bone Bracket starts when you say so.</p>
    </div>`;
}

function viewPound(): string {
  if (!save) return viewTitle();
  const s = save;
  const offer = poundOffers(save.poundSeed);
  const teachPanel =
    teachTarget !== null
      ? `<div class="panel bone">
          <b>Teach a trick to ${esc(save.kennel.dogs[Number(teachTarget)]?.name ?? "?")}</b>
          <div class="btnrow">
            ${offer.tricks.map((t) => {
              const trick = TRICKS[t];
              return `<button class="btn small violet" data-act="teach" data-trick="${t}">${esc(trick.name)} — ${TRICK_PRICE} scrap</button>`;
            }).join("")}
            <button class="btn small secondary" data-act="teach-cancel">cancel</button>
          </div>
          <p class="mono-sm">lessons also available from any dog card later — the Pound stocks ${offer.tricks.map((t) => esc(TRICKS[t].name)).join(", ")} this week.</p>
        </div>`
      : "";

  return `
    <div class="panel rust">
      <h2>The Pound</h2>
      <p>Scrap in, mongrels out. Offers roll with the week (seed ${offer.seed}).</p>
    </div>
    ${teachPanel}
    <h3 style="margin:10px 0">Dogs — ${DOG_PRICE} scrap</h3>
    <div class="doggrid">
      ${offer.dogs
        .map(
          (d, i) => `
        <div class="dogcard">
          ${dogSvg(d, 200)}
          <div class="name display">${esc(d.name)}</div>
          <div class="mono-sm">${esc(STRAINS[d.strain].name)} — ${esc(STRAINS[d.strain].trait)}</div>
          <div class="stats">
            <span class="chip grit">GRIT ${STRAINS[d.strain].base.grit + d.grit}</span>
            <span class="chip fang">FANG ${STRAINS[d.strain].base.fang + d.fang}</span>
            <span class="chip flea">FLEA ${STRAINS[d.strain].base.flea + d.flea}</span>
          </div>
          <div class="order-list">${d.biteOrder.map((t) => `<span class="chip trick">${esc(TRICKS[t].name)}</span>`).join("")}</div>
          <div class="btnrow">
            <button class="btn small lime" data-act="buy-dog" data-i="${i}" ${s.kennel.dogs.length >= 4 ? "disabled" : ""}>buy — ${DOG_PRICE}</button>
          </div>
        </div>`,
        )
        .join("")}
    </div>
    <h3 style="margin:10px 0">Trick lessons — ${TRICK_PRICE} scrap</h3>
    <div class="panel">
      ${offer.tricks.map((t) => `<div><b>${esc(TRICKS[t].name)}</b> — ${esc(TRICKS[t].text)}</div>`).join("")}
      <div class="btnrow">
        <button class="btn violet" data-act="teach-start">teach one</button>
        <button class="btn secondary" data-act="pound-refresh">shake the cage (new offers — 10 scrap)</button>
      </div>
    </div>`;
}

function viewLeague(): string {
  if (!save) return viewTitle();
  const st = save.seasonState;

  if (!st) {
    return `
      <div class="panel gold">
        <h2>Bone Bracket — ${esc(DIVISIONS[save.division])}</h2>
        <p>8 weeks. Ghost kennels with their own schedules, scars, and standings.
        Win, and the Pit pays scrap. Top two climb divisions; bottom two fall.</p>
        <div class="btnrow">
          <button class="btn lime" data-act="season-start">Start Season ${save.season}</button>
        </div>
      </div>`;
  }

  const table = standings(st);
  const rows = table
    .map(
      (r) => `<tr class="${r.isPlayer ? "me" : ""}">
      <td>${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td><b>${r.points}</b></td>
    </tr>`,
    )
    .join("");

  const history = st.playerResults
    .slice()
    .reverse()
    .map(
      (r) => `<div class="mail-entry ${r.winner === 0 ? "sent" : r.winner === 1 ? "bad" : ""}">
      <b>W${r.week + 1}</b> vs ${esc(r.opponentName)} —
      ${r.winner === 0 ? '<span class="ok">WIN</span>' : r.winner === 1 ? '<span class="err">LOSS</span>' : "DRAW"}
      (${r.rounds} rounds, log ${esc(r.logHash)}, +${r.scrapEarned} scrap)
      <div class="mono-sm">${esc(r.packetCode.slice(0, 96))}…</div>
    </div>`,
    )
    .join("");

  const nextOpp = st.week < SEASON_WEEKS ? st.ghosts[st.schedule[st.week]] : null;
  const closePanel = st.done
    ? `<div class="verdict-banner ${save.lastClose && save.lastClose.relegated ? "lost" : ""}">
        <div class="display">${save.lastClose ? esc(save.lastClose.summary) : "Season complete"}</div>
        <div class="btnrow" style="justify-content:center">
          <button class="btn lime" data-act="season-close">Claim results &amp; roll next season</button>
        </div>
      </div>`
    : "";

  return `
    <div class="panel gold">
      <h2>Bone Bracket — ${esc(DIVISIONS[st.division])} · Season ${st.season}</h2>
      <p>Week ${Math.min(st.week + 1, SEASON_WEEKS)} of ${SEASON_WEEKS} · your scrap: <b>${st.scrap}</b></p>
      ${nextOpp ? `<div class="btnrow"><button class="btn lime" data-act="season-play">Play Week ${st.week + 1} vs ${esc(nextOpp.kennel.name)}</button></div>` : ""}
    </div>
    ${closePanel}
    <div class="panel">
      <h3>Standings</h3>
      <table>
        <tr><th>kennel</th><th>P</th><th>W</th><th>D</th><th>L</th><th>pts</th></tr>
        ${rows}
      </table>
    </div>
    <div class="panel">
      <h3>Season receipts</h3>
      ${history || '<p class="mono-sm">no bouts yet — the schedule is waiting.</p>'}
    </div>`;
}

function viewMailbox(): string {
  if (!save) return viewTitle();
  const myCode = encodeKennel(save.kennel);
  const log = save.mail
    .map(
      (m) => `<div class="mail-entry ${m.ok ? "sent" : "bad"}">
        <b>${esc(m.label)}</b> ${m.ok ? '<span class="ok">✓</span>' : '<span class="err">✗</span>'}
        <div>${esc(m.note)}</div>
        <div class="mono-sm">${esc(m.code.slice(0, 110))}…</div>
      </div>`,
    )
    .join("");

  return `
    <div class="panel gold">
      <h2>Mailbox — play-by-mail PvP</h2>
      <p>No server. No lies. Send your <b>Kennel Code</b>; they mail back a <b>Verdict Packet</b>
      that anyone can audit — it re-derives from its own claims.</p>
    </div>
    <div class="panel">
      <h3>Your Kennel Code</h3>
      <textarea id="my-code" rows="4" readonly>${esc(myCode)}</textarea>
      <div class="btnrow"><button class="btn cyan" data-act="copy-code">copy code</button></div>
    </div>
    <div class="panel">
      <h3>Challenge a mailed kennel</h3>
      <textarea id="opp-code" rows="4" placeholder="paste their kennel code here">${esc(drafts.oppCode)}</textarea>
      <div class="btnrow"><button class="btn lime" data-act="challenge">fight it (deterministic bout)</button></div>
    </div>
    <div class="panel">
      <h3>Audit a Verdict Packet</h3>
      <textarea id="opp-packet" rows="4" placeholder="paste a verdict packet here — the Pit re-derives it">${esc(drafts.oppPacket)}</textarea>
      <div class="btnrow"><button class="btn violet" data-act="audit">re-derive the verdict</button></div>
    </div>
    <div class="panel">
      <h3>Pit log</h3>
      ${log || '<p class="mono-sm">empty — mail something.</p>'}
    </div>`;
}

function viewBout(): string {
  if (!bout) return viewTitle();
  const ev = bout.result.events[Math.max(0, bout.idx - 1)];
  const done = bout.idx >= bout.result.events.length;
  const won = bout.result.winner;

  const fighterCard = (team: 0 | 1, d: Dog, dead: boolean) => {
    const hp = currentHp(bout!.idx, team, d.name, STRAINS[d.strain].base.grit + d.grit);
    const max = STRAINS[d.strain].base.grit + d.grit;
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    return `
      <div class="fighter ${team === 1 ? "enemy" : ""} ${dead ? "dead" : ""}">
        ${dogSvg(d, 64)}
        <div style="flex:1">
          <b>${esc(d.name)}</b>
          <div class="hpbar"><div class="fill ${pct < 30 ? "low" : ""}" style="width:${pct}%"></div></div>
          <div class="mono-sm">${hp}/${max} grit</div>
        </div>
      </div>`;
  };

  const teamCols = (team: 0 | 1) => `
    <div class="team-col">
      <h3>${esc(bout!.teamNames[team])}</h3>
      ${bout!.teams[team]
        .map((d) => fighterCard(team, d, currentHp(bout!.idx, team, d.name, 0) <= 0 && bout!.idx > 0))
        .join("")}
    </div>`;

  const tickerLines = bout.result.events
    .slice(0, bout.idx)
    .map((e, i, arr) => {
      const cls = e.kind === "death" ? "bad" : e.kind === "heal" ? "good" : i === arr.length - 1 ? "hot" : "";
      return `<div class="line ${cls}">[${e.round}] ${esc(e.text)}</div>`;
    })
    .join("");

  const banner = done
    ? `<div class="verdict-banner ${won === 1 ? "lost" : won === -1 ? "draw" : ""}">
        <div class="display">${won === -1 ? "Draw" : won === 0 ? esc(bout.teamNames[0]) : esc(bout.teamNames[1])} takes it</div>
        <p>${bout.result.rounds} rounds · log ${esc(bout.result.logHash)}</p>
        ${bout.scarred.length ? `<p class="scarline">scars: ${bout.scarred.map((s) => `${esc(s.dog)} → ${esc(s.scar.name)}`).join(", ")}</p>` : ""}
        <div class="btnrow" style="justify-content:center">
          <button class="btn cyan" data-act="copy-packet">copy verdict packet</button>
          <button class="btn" data-act="bout-exit">back</button>
        </div>
      </div>`
    : "";

  return `
    <div class="panel gold"><h2>${esc(bout.label)}</h2>
      <p class="mono-sm">round ${ev?.round ?? 0} · deterministic replay · every verdict keeps its receipts</p></div>
    <div class="battle-stage">
      ${teamCols(0)}
      <div class="center-col">
        <div class="trick-flash">${esc(ev ? ev.text.slice(0, 60) : "The Pit locks the gate.")}</div>
        <div class="btnrow" style="justify-content:center">
          <button class="btn small ${bout.playing ? "danger" : "lime"}" data-act="bout-toggle">${bout.playing ? "pause" : "play"}</button>
          <button class="btn small secondary" data-act="bout-step">step</button>
          <button class="btn small secondary" data-act="bout-skip">skip</button>
        </div>
        <div class="ticker" id="ticker">${tickerLines}</div>
      </div>
      ${teamCols(1)}
    </div>
    ${banner}`;
}

// ---------------------------------------------------------------- events

app.addEventListener("input", (e) => {
  const t = e.target as HTMLElement;
  if (t instanceof HTMLTextAreaElement && t.id === "opp-code") drafts.oppCode = t.value;
  if (t instanceof HTMLTextAreaElement && t.id === "opp-packet") drafts.oppPacket = t.value;
});

app.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target || !save) {
    if (!target) return;
  }
  const act = target!.dataset.act;
  const i = Number(target!.dataset.i ?? "-1");

  switch (act) {
    case "dismiss":
      msg = "";
      break;
    case "new-game":
      if (!save || confirm("Start a new kennel? This replaces your current career.")) newCareer();
      break;
    case "continue":
      screen = "kennel";
      break;
    case "goto":
      screen = target!.dataset.screen as Screen;
      break;
    case "rename": {
      const name = prompt("Kennel name", save!.kennel.name);
      const motto = prompt("Kennel motto", save!.kennel.motto);
      if (name) save!.kennel.name = name.slice(0, 40);
      if (motto) save!.kennel.motto = motto.slice(0, 80);
      store();
      break;
    }
    case "dog-up":
      if (i > 0) {
        const d = save!.kennel.dogs;
        [d[i - 1], d[i]] = [d[i], d[i - 1]];
        store();
      }
      break;
    case "dog-down":
      if (i < save!.kennel.dogs.length - 1) {
        const d = save!.kennel.dogs;
        [d[i + 1], d[i]] = [d[i], d[i + 1]];
        store();
      }
      break;
    case "dog-release":
      if (save!.kennel.dogs.length > 1 && confirm(`Release ${save!.kennel.dogs[i].name} into the night?`)) {
        save!.kennel.dogs.splice(i, 1);
        store();
      }
      break;
    case "buy-dog": {
      const offer = poundOffers(save!.poundSeed);
      const dog = offer.dogs[i];
      if (!dog) break;
      if (save!.scrap < DOG_PRICE) {
        say("Not enough scrap. The Pound does not do credit.");
      } else if (save!.kennel.dogs.length >= 4) {
        say("Kennel is full — release a dog first.");
      } else {
        save!.scrap -= DOG_PRICE;
        save!.kennel.dogs.push({ ...dog, id: `${dog.id}-${save!.boutCounter}` });
        store();
        say(`${dog.name} joins the kennel.`);
      }
      break;
    }
    case "pound-refresh":
      if (save!.scrap < 10) {
        say("The cage costs 10 scrap to shake.");
      } else {
        save!.scrap -= 10;
        save!.poundSeed += 1;
        store();
        say("New offers.");
      }
      break;
    case "teach-start":
      teachTarget = "0";
      break;
    case "teach-cancel":
      teachTarget = null;
      break;
    case "teach": {
      const idx = Number(teachTarget ?? "0");
      const dog = save!.kennel.dogs[idx];
      const trickId = target!.dataset.trick!;
      if (!dog) break;
      if (save!.scrap < TRICK_PRICE) {
        say("Not enough scrap for a lesson.");
      } else {
        const res = teachTrick(dog, trickId);
        if (res.ok) {
          save!.scrap -= TRICK_PRICE;
          store();
          say(`${dog.name} learned ${TRICKS[trickId].name}.`);
          teachTarget = null;
        } else {
          say(res.error ?? "the trick will not stick");
        }
      }
      break;
    }
    case "season-start": {
      save!.seasonState = startSeason(save!.kennel, fnv1a(`muttpit|${save!.season}|${save!.boutCounter}`), save!.division, save!.season, save!.scrap);
      save!.lastClose = null;
      store();
      break;
    }
    case "season-play": {
      const st = save!.seasonState;
      if (!st || st.done) break;
      const outcome = playWeek(st);
      save!.seasonState = outcome.state;
      save!.scrap = outcome.state.scrap;
      store();
      const opp = outcome.state.playerResults[outcome.state.playerResults.length - 1];
      startBout(
        outcome.result,
        [st.player.name, opp.opponentName],
        [st.player.dogs.slice(0, 3), st.ghosts.find((g) => g.id === opp.opponentId)?.kennel.dogs.slice(0, 3) ?? []],
        outcome.packetCode,
        `Bone Bracket — Week ${opp.week + 1} vs ${opp.opponentName}`,
        "league",
        outcome.scarred,
      );
      break;
    }
    case "season-close": {
      const st = save!.seasonState;
      if (!st || !st.done) break;
      const close = closeSeason(st);
      save!.lastClose = close;
      save!.scrap = close.state.scrap;
      save!.division = close.state.division;
      save!.season += 1;
      save!.seasonState = nextSeason(close.state);
      store();
      say(close.summary);
      break;
    }
    case "challenge": {
      const ta = document.getElementById("opp-code") as HTMLTextAreaElement | null;
      const decoded = decodeKennel(ta?.value ?? "");
      if (!decoded.ok || !decoded.kennel) {
        say(decoded.error ?? "that code will not decode");
        break;
      }
      const seed = fnv1a(`${encodeKennel(save!.kennel)}|${encodeKennel(decoded.kennel)}|${save!.boutCounter}`);
      const { result, packet } = resolveBout(save!.kennel, decoded.kennel, seed);
      const code = encodePacket(packet);
      startBout(
        result,
        [save!.kennel.name, decoded.kennel.name],
        [save!.kennel.dogs.slice(0, 3), decoded.kennel.dogs.slice(0, 3)],
        code,
        `Mailed challenge vs ${decoded.kennel.name}`,
        "mailbox",
        [],
        { kind: "challenge", label: `challenge vs ${decoded.kennel.name}` },
      );
      break;
    }
    case "audit": {
      const ta = document.getElementById("opp-packet") as HTMLTextAreaElement | null;
      const audit = auditPacket(ta?.value ?? "");
      if (audit.ok && audit.verdict) {
        const v: VerdictPacket = audit.verdict;
        save!.mail.unshift({
          kind: "audit",
          label: "verdict audit",
          code: ta!.value.trim(),
          ok: true,
          note: `re-derived clean: log ${audit.replayedHash} — winner declared, receipts intact`,
        });
        say(`Audit CLEAN — replayed log ${audit.replayedHash} matches the packet (winner recorded, ${v.rounds} rounds).`);
      } else {
        save!.mail.unshift({
          kind: "audit",
          label: "verdict audit",
          code: (ta?.value ?? "").trim().slice(0, 400),
          ok: false,
          note: audit.error ?? "audit failed",
        });
        say(`Audit REJECTED — ${audit.error ?? "unknown"}`);
      }
      save!.mail = save!.mail.slice(0, 30);
      store();
      break;
    }
    case "copy-code": {
      const ta = document.getElementById("my-code") as HTMLTextAreaElement | null;
      void copyText(ta?.value ?? "");
      say("Kennel code copied. Mail it to someone with a kennel.");
      break;
    }
    case "copy-packet":
      void copyText(bout?.packetCode ?? "");
      say("Verdict packet copied. Anyone can audit it.");
      break;
    case "bout-toggle":
      if (bout) {
        if (bout.idx >= bout.result.events.length) break;
        bout.playing = !bout.playing;
      }
      break;
    case "bout-step":
      if (bout && bout.idx < bout.result.events.length) {
        bout.playing = false;
        bout.idx += 1;
      } else if (bout) finishBoutPlayback();
      break;
    case "bout-skip":
      if (bout) {
        bout.idx = bout.result.events.length;
        finishBoutPlayback();
      }
      break;
    case "bout-exit":
      if (bout?.timer) window.clearInterval(bout.timer);
      screen = bout?.returnScreen ?? "kennel";
      bout = null;
      break;
  }
  render();
  const ticker = document.getElementById("ticker");
  if (ticker) ticker.scrollTop = ticker.scrollHeight;
});

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

// Automation verification hook: read-only state plus code plumbing so browser
// proof can exercise the full mail round-trip (code -> challenge -> verdict ->
// audit) without the clipboard.
(window as unknown as Record<string, unknown>).__muttpit = {
  version: 1,
  screen: () => screen,
  kennelCode: () => (save ? encodeKennel(save.kennel) : ""),
  lastPacket: () => bout?.packetCode ?? "",
  setOppCode: (code: string) => {
    const ta = document.getElementById("opp-code") as HTMLTextAreaElement | null;
    if (ta) {
      ta.value = code;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },
  setOppPacket: (code: string) => {
    const ta = document.getElementById("opp-packet") as HTMLTextAreaElement | null;
    if (ta) {
      ta.value = code;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },
};

render();
