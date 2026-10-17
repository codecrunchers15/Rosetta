import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { canApprove, editsSchema, publicCard } from "@/lib/cards";
import { applyEdits } from "@/lib/edits";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { CardEdits, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** POST /api/approve { cardId, edits }: only the engineer can approve (FR-5.2). */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { cardId, edits } = await readJson(req, z.object({ cardId: z.string(), edits: editsSchema.default({}) }));
  const card = await store.get<StoredCard>("cards", cardId);
  if (!card) throw new ApiError("not_found");
  if (!canApprove(card, user)) {
    throw new ApiError("forbidden", "Only the engineer who made this change can approve it.");
  }

  const approved: StoredCard = {
    ...card,
    explanation: applyEdits(card.explanation, edits as CardEdits),
    status: "approved",
    approvedBy: user.name,
    approvedAt: new Date().toISOString(),
  };
  await store.set("cards", cardId, approved);
  return json({ card: publicCard(approved, user) });
});
