import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { canReview, canSeeCard, isTechnical, orgMembers, personOf } from "@/lib/org";
import { store } from "@/lib/store";
import { display, translated } from "@/lib/translate";
import type { Comment, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/cards/:id/comments { text }
 * Engineers write notes on a change; their managers read them at their own level.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const { text } = await readJson(req, z.object({ text: z.string().trim().min(1).max(2000) }));
  const card = await store.get<StoredCard>("cards", id);
  const users = await orgMembers(me.orgId);
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");
  if (!isTechnical(me.role) && !canReview(me, card)) {
    throw new ApiError("forbidden", "Comments come from engineers. Ask a question instead.");
  }

  const comment: Comment = {
    id: `m_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    orgId: me.orgId,
    cardId: id,
    authorId: me.id,
    source: "rosetta",
    repo: card.repo,
    createdAt: new Date().toISOString(),
    ...(await translated(text, me.name, card.explanation.title)),
  };
  await store.set("comments", comment.id, comment);
  return json(
    { comment: { id: comment.id, author: personOf(me, users), source: comment.source, createdAt: comment.createdAt, ...display(comment, me.role) } },
    201,
  );
});
