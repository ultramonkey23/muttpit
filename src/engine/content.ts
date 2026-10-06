/**
 * MUTTPIT content truth: strains and tricks.
 * Version-locked entities — a dog is an exact build, never a vibe.
 */

export type StrainId = "mongrel" | "bonehound" | "grem" | "cur" | "brute" | "pupp";
export type StatusId = "bleed" | "shield" | "rage" | "cower" | "marked" | "dodge";
export type TargetKind =
  | "enemyFront"
  | "enemyBack"
  | "enemyAny"
  | "allEnemies"
  | "self"
  | "allyLow"
  | "allAllies";

export interface StrainDef {
  id: StrainId;
  name: string;
  blurb: string;
  base: { grit: number; fang: number; flea: number };
  trait: string;
}

export const STRAINS: Record<StrainId, StrainDef> = {
  mongrel: {
    id: "mongrel",
    name: "Mongrel",
    blurb: "Ninety percent street, ten percent something else.",
    base: { grit: 13, fang: 5, flea: 4 },
    trait: "Scrappy — first hit each bout deals 2 less.",
  },
  bonehound: {
    id: "bonehound",
    name: "Bonehound",
    blurb: "Already died once. Filed a complaint.",
    base: { grit: 11, fang: 5, flea: 4 },
    trait: "Undead — starts each bout with SHIELD 3.",
  },
  grem: {
    id: "grem",
    name: "Grem",
    blurb: "Small, loud, legally a hazard.",
    base: { grit: 10, fang: 5, flea: 4 },
    trait: "Volatile — +2 FANG while below half GRIT.",
  },
  cur: {
    id: "cur",
    name: "Cur",
    blurb: "Bites first, negotiates never.",
    base: { grit: 12, fang: 4, flea: 4 },
    trait: "Bleeder — its attacks apply BLEED 1.",
  },
  brute: {
    id: "brute",
    name: "Brute",
    blurb: "Solves problems by becoming a larger problem.",
    base: { grit: 19, fang: 7, flea: 3 },
    trait: "Heavy — takes 2 less from barrage tricks.",
  },
  pupp: {
    id: "pupp",
    name: "Pupp",
    blurb: "Fast enough to regret everything later.",
    base: { grit: 10, fang: 5, flea: 7 },
    trait: "Quick — acts first on any tick tie.",
  },
};

export interface Effect {
  kind: "damage" | "damageAll" | "heal" | "shield" | "apply";
  power: number;
  /** damage scales from the actor's current FANG */
  fromFang?: boolean;
  /** +2 per BLEED stack on the target */
  perBleedOnTarget?: boolean;
  /** +2 per other living ally */
  perOtherAlly?: boolean;
  /** +half of the actor's missing GRIT (Spite) */
  perOwnMissingGrit?: boolean;
  status?: StatusId;
}

export interface TrickDef {
  id: string;
  name: string;
  text: string;
  target: TargetKind;
  effects: Effect[];
  tags: string[];
}

function t(
  id: string,
  name: string,
  text: string,
  target: TargetKind,
  effects: Effect[],
  tags: string[] = [],
): TrickDef {
  return { id, name, text, target, effects, tags };
}

export const TRICKS: Record<string, TrickDef> = {
  snap: t("snap", "Snap", "Front enemy takes FANG damage.", "enemyFront", [
    { kind: "damage", power: 0, fromFang: true },
  ]),
  maul: t("maul", "Maul", "Front enemy takes FANG + 2.", "enemyFront", [
    { kind: "damage", power: 2, fromFang: true },
  ]),
  backbite: t("backbite", "Back Bite", "Back enemy takes FANG - 1.", "enemyBack", [
    { kind: "damage", power: -1, fromFang: true },
  ]),
  flurry: t("flurry", "Flurry", "Front enemy takes two hits of FANG - 2.", "enemyFront", [
    { kind: "damage", power: -2, fromFang: true },
    { kind: "damage", power: -2, fromFang: true },
  ]),
  fleabite: t("fleabite", "Flea Bite", "Front enemy takes 1 and gains BLEED 2.", "enemyFront", [
    { kind: "damage", power: 1 },
    { kind: "apply", power: 2, status: "bleed" },
  ]),
  tickharvest: t(
    "tickharvest",
    "Tick Harvest",
    "Front enemy takes FANG + 2 per BLEED on it.",
    "enemyFront",
    [
      { kind: "damage", power: 0, fromFang: true },
      { kind: "damage", power: 2, perBleedOnTarget: true },
    ],
    ["blood"],
  ),
  bonecrack: t("bonecrack", "Bone Crack", "Front enemy takes FANG and gains MARKED 1.", "enemyFront", [
    { kind: "damage", power: 0, fromFang: true },
    { kind: "apply", power: 1, status: "marked" },
  ]),
  spite: t("spite", "Spite", "Front enemy takes FANG + half your missing GRIT.", "enemyFront", [
    { kind: "damage", power: 0, fromFang: true, perOwnMissingGrit: true },
  ], ["spite"]),
  howl: t("howl", "Howl", "All allies gain RAGE 1.", "allAllies", [
    { kind: "apply", power: 1, status: "rage" },
  ], ["pack"]),
  cower: t("cower", "Cower", "Gain SHIELD 3.", "self", [
    { kind: "shield", power: 3 },
  ]),
  boneshield: t("boneshield", "Bone Shield", "Lowest-GRIT ally gains SHIELD 4.", "allyLow", [
    { kind: "shield", power: 4 },
  ]),
  secondwind: t("secondwind", "Second Wind", "Heal 5.", "self", [
    { kind: "heal", power: 5 },
  ], ["blood"]),
  lickwounds: t("lickwounds", "Lick Wounds", "Lowest-GRIT ally heals 4.", "allyLow", [
    { kind: "heal", power: 4 },
  ], ["blood"]),
  whiffle: t("whiffle", "Whiffle Barrage", "All enemies take 3.", "allEnemies", [
    { kind: "damageAll", power: 3 },
  ], ["barrage"]),
  packpounce: t(
    "packpounce",
    "Pack Pounce",
    "Front enemy takes FANG + 2 per other living ally.",
    "enemyFront",
    [{ kind: "damage", power: 0, fromFang: true, perOtherAlly: true }],
    ["pack"],
  ),
  playdead: t("playdead", "Play Dead", "Gain DODGE 1.", "self", [
    { kind: "apply", power: 1, status: "dodge" },
  ]),
  countersnarl: t("countersnarl", "Counter Snarl", "Gain SHIELD 2 and RAGE 1.", "self", [
    { kind: "shield", power: 2 },
    { kind: "apply", power: 1, status: "rage" },
  ]),
  mudtoss: t("mudtoss", "Mud Toss", "Front enemy gains MARKED 2.", "enemyFront", [
    { kind: "apply", power: 2, status: "marked" },
  ]),
  goad: t("goad", "Goad", "Front enemy gains RAGE 2 and COWER 2.", "enemyFront", [
    { kind: "apply", power: 2, status: "rage" },
    { kind: "apply", power: 2, status: "cower" },
  ]),
  shriek: t("shriek", "Shriek", "All enemies gain BLEED 1.", "allEnemies", [
    { kind: "apply", power: 1, status: "bleed" },
  ], ["barrage", "blood"]),
  marrow: t("marrow", "Marrow", "Heal 3 and gain RAGE 1.", "self", [
    { kind: "heal", power: 3 },
    { kind: "apply", power: 1, status: "rage" },
  ], ["blood"]),
  sic: t("sic", "Sic 'Em", "Front enemy takes FANG + 1, +2 more if bleeding.", "enemyFront", [
    { kind: "damage", power: 1, fromFang: true },
    { kind: "damage", power: 2, perBleedOnTarget: true },
  ], ["blood"]),
  rally: t("rally", "Rally", "All allies gain SHIELD 2.", "allAllies", [
    { kind: "shield", power: 2 },
  ], ["pack"]),
  verdict: t("verdict", "The Pit Decides", "Front enemy takes FANG + 3; gain COWER 1.", "enemyFront", [
    { kind: "damage", power: 3, fromFang: true },
    { kind: "apply", power: 1, status: "cower" },
  ]),
  goForTheEyes: t("goForTheEyes", "Go For The Eyes", "Front enemy takes 2 and gains COWER 1.", "enemyFront", [
    { kind: "damage", power: 2 },
    { kind: "apply", power: 1, status: "cower" },
  ]),
};

export const TRICK_IDS = Object.keys(TRICKS);
export const MAX_BITE_ORDER = 4;
export const KENNEL_SIZE = 4;
export const LINEUP_SIZE = 3;
export const MAX_ROUNDS = 60;
