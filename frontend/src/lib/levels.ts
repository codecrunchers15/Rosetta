export const LEVELS = [
  { key: "engineer", label: "Engineer" },
  { key: "senior", label: "Senior dev" },
  { key: "intern", label: "Intern" },
  { key: "manager", label: "Manager" },
  { key: "client", label: "Client" },
  { key: "mom", label: "My mom" },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

export const LAST_LEVEL = LEVELS.length - 1;

/** Manager on the card view (FR-2.4). */
export const CARD_DEFAULT_LEVEL = 3;
/** Engineer on the home mini demo. */
export const DEMO_DEFAULT_LEVEL = 0;

/** Readers who can take technical answers. */
export const isTechnicalLevel = (key: LevelKey) =>
  key === "engineer" || key === "senior" || key === "intern";

/** How the level last changed; picks the transition (design.md §7). */
export type LevelSource = "drag" | "pointer" | "click" | "keyboard" | "program";

export type LevelState = { index: number; source: LevelSource };
