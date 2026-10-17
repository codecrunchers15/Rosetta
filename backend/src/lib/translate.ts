import { aiConfigured } from "./ai/provider";
import { translateForLevels } from "./ai/tasks";
import type { LevelKey } from "./levels";
import type { Translated } from "./types";

/** Stores the original plus a version for every level (best effort: no AI key, no versions). */
export async function translated(text: string, authorName: string, context?: string): Promise<Translated> {
  if (!aiConfigured()) return { text };
  try {
    return { text, levels: await translateForLevels(text, authorName, context) };
  } catch {
    return { text };
  }
}

/** What one reader sees: their level's version, or the original. */
export const display = (t: Translated, level: LevelKey) => ({
  text: t.levels?.[level] ?? t.text,
  original: t.text,
  translated: Boolean(t.levels?.[level] && t.levels[level] !== t.text),
});
