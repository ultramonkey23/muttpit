/**
 * Procedural kennel portraits — every dog is drawn from its own fingerprint.
 * No binary assets, no generated images (SOLO mesh: no GPU art this session):
 * the roster is code, so the art is code.
 */

import { fnv1a } from "./engine/rng";
import { STRAINS, type StrainId } from "./engine/content";
import type { Dog } from "./engine/battle";

function hashParts(...parts: (string | number)[]): number {
  return fnv1a(parts.join("|"));
}

const COATS = ["#b4532a", "#8a6f4e", "#e8dcc4", "#5c4632", "#6b705c", "#a3a388", "#c98a4b", "#7a5c3e"];

function strainBadge(strain: StrainId): string {
  const map: Record<StrainId, string> = {
    mongrel: "MNG",
    bonehound: "BNH",
    grem: "GRM",
    cur: "CUR",
    brute: "BRT",
    pupp: "PUP",
  };
  return map[strain];
}

/** SVG portrait, deterministic per dog. */
export function dogSvg(dog: Dog, size = 120): string {
  const seed = hashParts(dog.name, dog.strain, dog.biteOrder.join(","), dog.scars.length);
  const coat = COATS[Math.abs(seed) % COATS.length];
  const earType = Math.abs(seed >> 3) % 3; // 0 spike, 1 flop, 2 bat
  const tailType = Math.abs(seed >> 6) % 3;
  const eyeType = Math.abs(seed >> 9) % 3;
  const snout = 18 + (Math.abs(seed >> 12) % 10);

  const ears =
    earType === 0
      ? `<path d="M30 42 L38 12 L52 38 Z" fill="${coat}" stroke="#120c08" stroke-width="3"/>
         <path d="M90 42 L82 12 L68 38 Z" fill="${coat}" stroke="#120c08" stroke-width="3"/>`
      : earType === 1
        ? `<path d="M28 40 Q12 20 24 58 Q34 52 34 42 Z" fill="${coat}" stroke="#120c08" stroke-width="3"/>
           <path d="M92 40 Q108 20 96 58 Q86 52 86 42 Z" fill="${coat}" stroke="#120c08" stroke-width="3"/>`
        : `<path d="M32 44 L28 18 L52 34 Z" fill="${coat}" stroke="#120c08" stroke-width="3"/>
           <path d="M88 44 L92 18 L68 34 Z" fill="${coat}" stroke="#120c08" stroke-width="3"/>`;

  const eyes =
    eyeType === 0
      ? `<circle cx="46" cy="56" r="5" fill="#e8dcc4" stroke="#120c08" stroke-width="2"/><circle cx="74" cy="56" r="5" fill="#e8dcc4" stroke="#120c08" stroke-width="2"/>
         <circle cx="47" cy="57" r="2" fill="#120c08"/><circle cx="75" cy="57" r="2" fill="#120c08"/>`
      : eyeType === 1
        ? `<circle cx="46" cy="56" r="5" fill="#f5b83d" stroke="#120c08" stroke-width="2"/><circle cx="74" cy="56" r="5" fill="#f5b83d" stroke="#120c08" stroke-width="2"/>
           <circle cx="46" cy="56" r="2" fill="#120c08"/><circle cx="74" cy="56" r="2" fill="#120c08"/>`
        : `<path d="M40 54 L52 52" stroke="#120c08" stroke-width="4"/><path d="M68 52 L80 54" stroke="#120c08" stroke-width="4"/>
           <circle cx="46" cy="58" r="3" fill="#120c08"/><circle cx="74" cy="58" r="3" fill="#120c08"/>`;

  const tail =
    tailType === 0
      ? `<path d="M96 88 Q118 70 112 46" fill="none" stroke="${coat}" stroke-width="9" stroke-linecap="round"/>`
      : tailType === 1
        ? `<path d="M96 88 Q112 82 118 92" fill="none" stroke="${coat}" stroke-width="9" stroke-linecap="round"/>`
        : `<path d="M96 88 L114 58 L108 84 Z" fill="${coat}" stroke="#120c08" stroke-width="3"/>`;

  const scars = dog.scars
    .slice(0, 4)
    .map(
      (_, i) =>
        `<path d="M${34 + i * 14} ${86 + (i % 2) * 6} l8 8 M${42 + i * 14} ${86 + (i % 2) * 6} l-8 8" stroke="#e5484d" stroke-width="2.5" stroke-linecap="round"/>`,
    )
    .join("");

  return `<svg class="portrait" viewBox="0 0 130 120" width="${size}" height="${(size * 120) / 130}" xmlns="http://www.w3.org/2000/svg">
  <rect width="130" height="120" fill="#1c1410"/>
  ${tail}
  <ellipse cx="65" cy="92" rx="38" ry="22" fill="${coat}" stroke="#120c08" stroke-width="3"/>
  ${ears}
  <circle cx="65" cy="58" r="30" fill="${coat}" stroke="#120c08" stroke-width="3"/>
  ${eyes}
  <ellipse cx="65" cy="74" rx="${snout / 2}" ry="10" fill="#e8dcc4" stroke="#120c08" stroke-width="3"/>
  <ellipse cx="65" cy="68" rx="6" ry="4.5" fill="#120c08"/>
  <path d="M58 80 Q65 86 72 80" fill="none" stroke="#120c08" stroke-width="2.5" stroke-linecap="round"/>
  ${scars}
  <rect x="2" y="2" width="34" height="15" fill="#120c08"/>
  <text x="6" y="13" font-family="monospace" font-size="10" fill="#f5b83d">${strainBadge(dog.strain)}</text>
</svg>`;
}

/** Strain roster card art (same generator, seeded by strain name). */
export function strainSvg(strain: StrainId, size = 120): string {
  const base = STRAINS[strain].base;
  return dogSvg(
    {
      id: strain,
      name: STRAINS[strain].name,
      strain,
      ...base,
      biteOrder: [],
      scars: [],
    },
    size,
  );
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
