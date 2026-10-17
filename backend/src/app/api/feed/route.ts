import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { feedItem } from "@/lib/cards";
import { json, preflight, route } from "@/lib/http";
import { canSeeCard, descendants, orgMembers, personOf, requireOrg, teamOf, visibleAuthorIds } from "@/lib/org";
import { store } from "@/lib/store";
import { syncIsStale, syncOrg } from "@/lib/sync";
import type { Comment, StoredCard, Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const WEEK = 7 * 86_400_000;

/**
 * GET /api/feed?author=&team=&status=
 * The changes this person should see, at their reading level:
 * an engineer sees their own, a manager their team's, a CMO everyone's.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const users = await orgMembers(org.id);
  const params = new URL(req.url).searchParams;

  // New pushes arrive without anyone pasting a link.
  if (syncIsStale(org)) after(() => syncOrg(org, users).catch(() => {}));

  const [cards, comments, tickets] = await Promise.all([
    store.list<StoredCard>("cards", "orgId", org.id),
    store.list<Comment>("comments", "orgId", org.id),
    store.list<Ticket>("tickets", "orgId", org.id),
  ]);

  const visible = cards.filter((c) => canSeeCard(me, c, users));
  const owner = (c: StoredCard) => c.authorUserId ?? c.createdBy ?? "";

  let filtered = visible;
  const author = params.get("author");
  const team = params.get("team");
  const status = params.get("status");
  if (author) filtered = filtered.filter((c) => owner(c) === author);
  if (team) {
    const members = new Set([team, ...descendants(team, users).map((u) => u.id)]);
    filtered = filtered.filter((c) => members.has(owner(c)));
  }
  if (status === "draft" || status === "approved") filtered = filtered.filter((c) => c.status === status);

  const items = filtered
    .sort((a, b) => b.committedAt.localeCompare(a.committedAt))
    .map((c) =>
      feedItem(c, me, users, {
        comments: comments.filter((m) => m.cardId === c.id).length,
        openQuestions: tickets.filter((t) => t.context?.cardId === c.id && t.status !== "closed").length,
      }),
    );

  // People and teams to filter by: only those whose work this person can see.
  const visibleIds = visibleAuthorIds(me, users);
  const people = users
    .filter((u) => visibleIds.has(u.id) && u.id !== me.id && u.role !== "client" && u.role !== "cmo")
    .map((u) => personOf(u, users));
  const teams = users
    .filter((u) => u.role === "manager" && visibleIds.has(u.id))
    .map((u) => ({ id: u.id, name: personOf(u, users).team?.name ?? u.name, lead: u.name }));

  const now = Date.now();
  return json({
    items,
    people,
    teams,
    myTeam: teamOf(me, users) ? personOf(me, users).team : null,
    stats: {
      total: visible.length,
      thisWeek: visible.filter((c) => now - new Date(c.committedAt).getTime() < WEEK).length,
      notReviewed: visible.filter((c) => c.status === "draft").length,
      highRisk: visible.filter((c) => c.explanation.risk !== "low").length,
      openQuestions: tickets.filter((t) => (t.toId === me.id || t.fromId === me.id) && t.status !== "closed").length,
    },
    sync: { repos: org.repos.length, lastSyncAt: org.lastSyncAt ?? null },
  });
});
