import { createHash } from "node:crypto";
import { z } from "zod";
import { SAMPLES } from "./demo/samples";
import { LEVELS } from "./levels";
import type { ParsedLink } from "./github-url";
import type { Card, StoredCard, User, Viewer } from "./types";

/** One card per commit or PR, so a commit is only ever explained once. */
export function cardIdFor(link: ParsedLink) {
  // Short SHA, so full and 7-character links to one commit share a card.
  const ref = link.kind === "commit" ? link.sha.slice(0, 7) : `pull-${link.number}`;
  const key = `${link.owner}/${link.repo}@${ref}`.toLowerCase();
  return `c_${createHash("sha256").update(key).digest("hex").slice(0, 14)}`;
}

/** Pre-generated explanations for the demo commits (PRD reliability). */
export function demoSampleFor(repo: string, sha: string) {
  return SAMPLES.find((s) => s.card.repo.toLowerCase() === repo.toLowerCase() && s.sha.startsWith(sha.toLowerCase()));
}

export function canApprove(card: StoredCard, user: User | null) {
  if (!user) return false;
  if (card.createdBy === user.id) return true;
  return Boolean(user.githubLogin && card.author.login && user.githubLogin.toLowerCase() === card.author.login.toLowerCase());
}

export function viewerFor(card: StoredCard, user: User | null): Viewer {
  return { canApprove: canApprove(card, user), level: user?.role ?? null };
}

/** The card as the frontend's Card type, plus the viewer. */
export function publicCard(card: StoredCard, user: User | null): Card & { viewer: Viewer } {
  const { headSha: _h, reading: _r, findings: _f, createdBy: _c, createdAt: _a, approvedAt: _p, ...rest } = card;
  return { ...rest, viewer: viewerFor(card, user) };
}

const text = z.string().trim().min(1).max(600);
const levelEdits = z.object({ summary: text, analogy: text, impact: text }).partial();

export const editsSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  levels: z.partialRecord(z.enum(LEVELS.map((l) => l.key) as [string, ...string[]]), levelEdits).optional(),
});
