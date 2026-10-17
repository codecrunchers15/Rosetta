import { requireUser } from "@/lib/auth";
import { publicCard } from "@/lib/cards";
import { ApiError, json, preflight, route } from "@/lib/http";
import { canSeeCard, orgMembers, personOf } from "@/lib/org";
import { store } from "@/lib/store";
import { display } from "@/lib/translate";
import type { Comment, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/cards/:id → the card at the viewer's level, with the engineers' comments. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const card = await store.get<StoredCard>("cards", id);
  const users = await orgMembers(me.orgId);
  // Same answer for "doesn't exist" and "not yours".
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");

  const comments = (await store.list<Comment>("comments", "cardId", id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => {
      const author = users.find((u) => u.id === c.authorId);
      return {
        id: c.id,
        author: author ? personOf(author, users) : null,
        source: c.source,
        githubUrl: c.githubUrl,
        createdAt: c.createdAt,
        ...display(c, me.role),
      };
    });

  return json({ ...publicCard(card, me, users), comments });
});
