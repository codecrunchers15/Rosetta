import { requireUser } from "@/lib/auth";
import { json, preflight, route } from "@/lib/http";
import { descendants, orgMembers, personOf, visibleAuthorIds } from "@/lib/org";
import { store } from "@/lib/store";
import { display } from "@/lib/translate";
import type { Comment, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/comments?author=&team=
 * Engineers' comments (from Rosetta and GitHub), newest first, each at the
 * reader's level. Managers pick one engineer or one team.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const users = await orgMembers(me.orgId);
  const params = new URL(req.url).searchParams;
  const visible = visibleAuthorIds(me, users);

  let allowed = visible;
  const author = params.get("author");
  const team = params.get("team");
  if (author) allowed = new Set([...visible].filter((id) => id === author));
  if (team) {
    const members = new Set([team, ...descendants(team, users).map((u) => u.id)]);
    allowed = new Set([...allowed].filter((id) => members.has(id)));
  }

  const [comments, cards] = await Promise.all([
    store.list<Comment>("comments", "orgId", me.orgId),
    store.list<StoredCard>("cards", "orgId", me.orgId),
  ]);
  const titles = new Map(cards.map((c) => [c.id, c.explanation.title]));

  const items = comments
    .filter((c) => allowed.has(c.authorId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map((c) => {
      const authorUser = users.find((u) => u.id === c.authorId);
      return {
        id: c.id,
        author: authorUser ? personOf(authorUser, users) : null,
        card: c.cardId ? { id: c.cardId, title: titles.get(c.cardId) ?? "" } : null,
        source: c.source,
        githubUrl: c.githubUrl,
        repo: c.repo,
        createdAt: c.createdAt,
        ...display(c, me.role),
      };
    });

  return json({ items });
});
