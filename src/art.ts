/**
 * Kennel portraits. Each dog is an authored look (generated, curated and cut
 * by the Studio, shipped as small WebP) with procedural identity layered on
 * top: a stable coat shift, its scars worn as stickers, its strain colors.
 * The engine never reads any of this — art is who the dog is, not what it does.
 */

import { STRAINS, type StrainId } from "./engine/content";
import type { Dog, Scar } from "./engine/battle";
import { coatShift, lookFor } from "./looks";

const ART = import.meta.glob("./assets/dogs/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export function lookUrl(lookId: string): string {
  return ART[`./assets/dogs/${lookId}.webp`] ?? "";
}

export const STRAIN_BADGE: Record<StrainId, string> = {
  mongrel: "MNG",
  bonehound: "BNH",
  grem: "GRM",
  cur: "CUR",
  brute: "BRT",
  pupp: "PUP",
};

function escAttr(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Scars are worn, not listed: each one is a sticker slapped on the portrait. */
const SCAR_GLYPH: Record<string, string> = {
  "chipped-fang": `<path d="M6 3 L14 3 L12 16 L10 11 L8 16 Z" fill="#e8dcc4" stroke="#120c08" stroke-width="1.6"/><path d="M9 6 l3 3" stroke="#e5484d" stroke-width="1.6"/>`,
  limp: `<rect x="3" y="7" width="14" height="7" rx="2" fill="#e8dcc4" stroke="#120c08" stroke-width="1.6" transform="rotate(-20 10 10)"/><path d="M8 8 v5 M12 7 v5" stroke="#b4532a" stroke-width="1.2" transform="rotate(-20 10 10)"/>`,
  "scar-tissue": `<path d="M3 15 L17 5" stroke="#e5484d" stroke-width="2.4"/><path d="M6 9 l4 4 M9 7 l4 4 M12 5 l4 4" stroke="#120c08" stroke-width="1.5"/>`,
  "missing-ear": `<path d="M5 17 L7 4 L15 10 L11 11 L13 14 L9 14 Z" fill="#b4532a" stroke="#120c08" stroke-width="1.6"/>`,
  renown: `<circle cx="10" cy="11" r="6" fill="#f5b83d" stroke="#120c08" stroke-width="1.6"/><path d="M10 7.5 l1.1 2.3 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="#120c08"/><path d="M7 3 l3 3 3-3" fill="none" stroke="#8b5cf6" stroke-width="2"/>`,
  "battle-sense": `<path d="M2 10 Q10 2 18 10 Q10 18 2 10 Z" fill="#e8dcc4" stroke="#120c08" stroke-width="1.6"/><circle cx="10" cy="10" r="3" fill="#38d6c8" stroke="#120c08" stroke-width="1.2"/>`,
};

function scarStickers(scars: Scar[]): string {
  if (!scars.length) return "";
  const shown = scars.slice(-4);
  return `<div class="scar-stickers">${shown
    .map(
      (s) =>
        `<span class="scar-sticker" title="${escAttr(`${s.name} — ${s.text}`)}"><svg viewBox="0 0 20 20" aria-hidden="true">${SCAR_GLYPH[s.id] ?? SCAR_GLYPH["scar-tissue"]}</svg></span>`,
    )
    .join("")}${scars.length > 4 ? `<span class="scar-more">+${scars.length - 4}</span>` : ""}</div>`;
}

export interface ArtOpts {
  /** "card" = framed dossier portrait; "sprite" = bare full-body fighter */
  mode?: "card" | "sprite";
  facing?: "right" | "left";
  size?: number;
  showBadge?: boolean;
}

/** Full-body dog art, deterministic per dog identity (not per bite order). */
export function dogSvg(dog: Dog, size = 120, opts: ArtOpts = {}): string {
  const mode = opts.mode ?? "card";
  const look = lookFor(dog);
  const coat = coatShift(dog);
  const url = lookUrl(look.id);
  const flip = opts.facing === "left" ? " flip" : "";
  const alt = `${STRAINS[dog.strain].name} "${look.name}" — ${dog.name}`;
  const style = `--art-size:${size}px;--coat-hue:${coat.hue}deg;--coat-sat:${coat.sat.toFixed(2)}`;
  const img = url
    ? `<img class="dog-img${flip}" src="${url}" alt="${escAttr(alt)}" loading="lazy" decoding="async" draggable="false"/>`
    : `<span class="dog-missing">${STRAIN_BADGE[dog.strain]}</span>`;
  if (mode === "sprite") {
    return `<span class="dog-sprite strain-${dog.strain}" style="${style}">${img}${scarStickers(dog.scars)}</span>`;
  }
  return `<figure class="dog-art strain-${dog.strain}" style="${style}">
    ${img}
    ${opts.showBadge === false ? "" : `<span class="strain-badge">${STRAIN_BADGE[dog.strain]}</span>`}
    ${scarStickers(dog.scars)}
  </figure>`;
}

/** Strain roster card art (seeded by strain name). */
export function strainSvg(strain: StrainId, size = 120): string {
  const base = STRAINS[strain].base;
  return dogSvg({ id: strain, name: STRAINS[strain].name, strain, ...base, biteOrder: [], scars: [] }, size);
}

/** Simple decorative paw stamp used in headings. */
export function pawSvg(color = "#f5b83d", size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px">
  <circle cx="10" cy="13" r="5" fill="${color}" stroke="#120c08" stroke-width="1.5"/>
  <circle cx="4" cy="7" r="2.4" fill="${color}" stroke="#120c08" stroke-width="1.2"/>
  <circle cx="9" cy="4.5" r="2.4" fill="${color}" stroke="#120c08" stroke-width="1.2"/>
  <circle cx="14.5" cy="6" r="2.4" fill="${color}" stroke="#120c08" stroke-width="1.2"/>
</svg>`;
}
