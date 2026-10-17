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

/**
 * Fills in level versions for items written while no AI key was set.
 * Returns true when anything changed, so the caller can save.
 */
export async function backfill<T extends Translated & { authorId: string }>(
  items: T[],
  nameOf: (authorId: string) => string,
  context?: string,
  limit = 4,
) {
  if (!aiConfigured()) return false;
  const missing = items.filter((i) => !i.levels).slice(0, limit);
  if (!missing.length) return false;
  const results = await Promise.all(missing.map((i) => translated(i.text, nameOf(i.authorId), context)));
  let changed = false;
  missing.forEach((item, n) => {
    if (results[n].levels) {
      item.levels = results[n].levels;
      changed = true;
    }
  });
  return changed;
}

/** Adds level versions to one stored message after the response has gone out. */
export async function translateTicketMessageLater(ticketId: string, messageId: string, authorName: string, context?: string) {
  const { store } = await import("./store");
  const message = (await store.get<import("./types").Ticket>("tickets", ticketId))?.messages.find((m) => m.id === messageId);
  if (!message || message.levels) return;
  const result = await translated(message.text, authorName, context);
  if (!result.levels) return;
  // Re-read: someone may have replied while we were translating.
  const fresh = await store.get<import("./types").Ticket>("tickets", ticketId);
  const target = fresh?.messages.find((m) => m.id === messageId);
  if (!fresh || !target || target.levels) return;
  target.levels = result.levels;
  await store.set("tickets", ticketId, fresh);
}

export async function translateCommentLater(commentId: string, authorName: string, context?: string) {
  const { store } = await import("./store");
  const comment = await store.get<import("./types").Comment>("comments", commentId);
  if (!comment || comment.levels) return;
  const result = await translated(comment.text, authorName, context);
  if (!result.levels) return;
  await store.set("comments", commentId, { ...comment, levels: result.levels });
}
