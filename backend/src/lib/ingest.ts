import { createHash } from "node:crypto";
import { aiConfigured } from "./ai/provider";
import { explainChange } from "./ai/tasks";
import { cardIdFor, demoSampleFor } from "./cards";
import { diffText, findings as findingsFrom, trimFiles } from "./diff";
import { env } from "./env";
import { fetchChange, type Change, type RawFile } from "./github";
import type { ParsedLink } from "./github-url";
import { ApiError } from "./http";
import { sendNewChange } from "./mail";
import { store } from "./store";
import type { Explanation, Org, StoredCard, User } from "./types";

/**
 * Turning a commit into a card, shared by the manual "Explain" box, GitHub
 * sync, the webhook and the sample-team seed.
 */

const cacheId = (repo: string, sha: string) =>
  createHash("sha256").update(`${repo}@${sha}`.toLowerCase()).digest("hex").slice(0, 24);

/** Drops the cached explanation so the next request asks the model again. */
export const forgetExplanation = (repo: string, sha: string) => store.remove("explanations", cacheId(repo, sha));

/** The org member who wrote a change, matched by GitHub username. */
export const authorFor = (login: string, users: User[]) =>
  login ? users.find((u) => u.githubLogin?.toLowerCase() === login.toLowerCase()) : undefined;

export type Prepared = {
  change: Change;
  kept: RawFile[];
  truncated: boolean;
  findings: string[];
  reading: string;
};

export function prepare(change: Change): Prepared {
  const { files: kept, truncated } = trimFiles(change.files, env.maxDiffLines);
  const subject = change.subject.length > 60 ? `${change.subject.slice(0, 57)}…` : change.subject;
  return { change, kept, truncated, findings: findingsFrom(change.files, kept), reading: `“${subject}”` };
}

/** Cached by repo@sha, so the same commit never calls the model twice. */
export async function explanationFor(p: Prepared): Promise<Explanation> {
  const { change, kept, truncated } = p;
  const cached = await store.get<Explanation>("explanations", cacheId(change.repo, change.headSha));
  if (cached) return cached;
  const demo = change.ref.kind === "commit" ? demoSampleFor(change.repo, change.ref.sha) : undefined;
  if (demo) return demo.card.explanation;
  if (!aiConfigured()) throw new ApiError("unavailable", "No AI key configured.");
  const generated = await explainChange({
    repo: change.repo,
    message: change.message,
    files: kept.map((f) => f.filename),
    diff: diffText(kept),
    truncated,
  });
  const explanation: Explanation = { ...generated, files: kept.map((f) => f.filename) };
  await store.set("explanations", cacheId(change.repo, change.headSha), explanation);
  return explanation;
}

export function toCard(
  id: string,
  org: Org,
  p: Prepared,
  explanation: Explanation,
  users: User[],
  opts: { createdBy?: string; source: StoredCard["source"] },
): StoredCard {
  const { change, kept, truncated } = p;
  return {
    id,
    orgId: org.id,
    repo: change.repo,
    ref: change.ref,
    url: change.url,
    author: change.author,
    authorUserId: authorFor(change.author.login, users)?.id,
    committedAt: change.committedAt,
    status: "draft",
    files: kept.map((f) => ({ path: f.filename, additions: f.additions, deletions: f.deletions, url: f.blob_url })),
    ...(truncated ? { truncated: { shownFiles: kept.length } } : {}),
    explanation,
    headSha: change.headSha,
    reading: p.reading,
    findings: p.findings,
    createdBy: opts.createdBy,
    source: opts.source,
    createdAt: new Date().toISOString(),
  };
}

/** Explains a commit for a workspace in the background. Skips ones already done. */
export async function ingestLink(org: Org, link: ParsedLink, users: User[], source: StoredCard["source"]) {
  const id = cardIdFor(org.id, link);
  if (await store.get<StoredCard>("cards", id)) return null;
  const prepared = prepare(await fetchChange(link));
  const card = toCard(id, org, prepared, await explanationFor(prepared), users, { source });
  await store.set("cards", id, card);
  const author = users.find((u) => u.id === card.authorUserId);
  const manager = author && users.find((u) => u.id === author.managerId);
  if (author && manager) {
    await sendNewChange({
      to: manager.email,
      managerName: manager.name,
      authorName: author.name,
      title: card.explanation.title,
      summary: card.explanation.levels[manager.role].summary,
      cardId: card.id,
    });
  }
  return card;
}
