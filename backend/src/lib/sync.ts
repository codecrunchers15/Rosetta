import { listAuthorCommits, listRepoComments } from "./github";
import { ingestLink } from "./ingest";
import { isTechnical } from "./org";
import { store } from "./store";
import { translated } from "./translate";
import type { Comment, Org, StoredCard, User } from "./types";

/** At most this many new commits are explained per sync, to bound model calls. */
const MAX_NEW_COMMITS = 6;
const FIRST_SYNC_DAYS = 14;
/** Feeds trigger a background sync when the last one is older than this. */
export const SYNC_STALE_MS = 5 * 60_000;

const syncing = new Set<string>();

/**
 * Pulls new commits and comments by workspace members from the watched
 * repos. This is how an engineer's push reaches their manager without
 * anyone pasting a link (the webhook does the same, instantly).
 */
export async function syncOrg(org: Org, users: User[]) {
  if (syncing.has(org.id)) return { commits: 0, comments: 0, skipped: true };
  syncing.add(org.id);
  try {
    const since = org.lastSyncAt ?? new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000).toISOString();
    const startedAt = new Date().toISOString();
    const authors = users.filter((u) => u.githubLogin && u.status === "active");
    let commits = 0;
    let comments = 0;

    for (const repoName of org.repos) {
      const [owner, repo] = repoName.split("/");
      for (const author of authors) {
        if (commits >= MAX_NEW_COMMITS) break;
        const shas = await listAuthorCommits(repoName, author.githubLogin!, since).catch(() => []);
        for (const sha of shas) {
          if (commits >= MAX_NEW_COMMITS) break;
          const card = await ingestLink(org, { owner, repo, kind: "commit", sha }, users, "sync").catch(() => null);
          if (card) commits++;
        }
      }

      for (const c of await listRepoComments(repoName, since).catch(() => [])) {
        const author = users.find((u) => u.githubLogin?.toLowerCase() === c.login.toLowerCase());
        if (!author || !isTechnical(author.role) || c.body.includes("[Rosetta]")) continue;
        const id = `gh_${c.id}`;
        if (await store.get("comments", id)) continue;
        const cards = c.commitSha ? await store.list<StoredCard>("cards", "orgId", org.id) : [];
        const card = cards.find((k) => k.headSha === c.commitSha);
        const comment: Comment = {
          id,
          orgId: org.id,
          cardId: card?.id,
          authorId: author.id,
          source: "github",
          githubUrl: c.url,
          repo: repoName,
          createdAt: c.createdAt,
          ...(await translated(c.body, author.name, card?.explanation.title)),
        };
        await store.set("comments", id, comment);
        comments++;
      }
    }

    await store.set("orgs", org.id, { ...org, lastSyncAt: startedAt });
    return { commits, comments, skipped: false };
  } finally {
    syncing.delete(org.id);
  }
}

export const syncIsStale = (org: Org) =>
  org.repos.length > 0 && (!org.lastSyncAt || Date.now() - new Date(org.lastSyncAt).getTime() > SYNC_STALE_MS);
