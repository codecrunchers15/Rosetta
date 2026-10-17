import { optionalUser } from "@/lib/auth";
import { publicCard } from "@/lib/cards";
import { ApiError, json, preflight, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/cards/:id: public, so a manager can open a shared link. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const card = await store.get<StoredCard>("cards", id);
  if (!card) throw new ApiError("not_found");
  return json(publicCard(card, await optionalUser(req)));
});
