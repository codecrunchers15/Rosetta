import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { editsSchema, publicCard } from "@/lib/cards";
import { applyEdits } from "@/lib/edits";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { canReview, orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import type { CardEdits, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** POST /api/approve { cardId, edits }: the engineer checks and marks their change reviewed. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const { cardId, edits } = await readJson(req, z.object({ cardId: z.string(), edits: editsSchema.default({}) }));
  const card = await store.get<StoredCard>("cards", cardId);
  if (!card || card.orgId !== me.orgId) throw new ApiError("not_found");
  if (!canReview(me, card)) throw new ApiError("forbidden", "Only the engineer who made this change can review it.");

  const approved: StoredCard = {
    ...card,
    explanation: applyEdits(card.explanation, edits as CardEdits),
    status: "approved",
    approvedBy: me.name,
    approvedAt: new Date().toISOString(),
  };
  await store.set("cards", cardId, approved);
  return json({ card: publicCard(approved, me, await orgMembers(me.orgId)) });
});
