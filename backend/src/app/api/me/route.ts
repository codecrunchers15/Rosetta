import { publicUser, requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { meSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { Org, StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/me → { user, org } */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const org = await store.get<Org>("orgs", user.orgId);
  return json({ user, org: org ? { id: org.id, name: org.name, ownerId: org.ownerId } : null });
});

/** PATCH /api/me → { user }. Role and email can't change here. */
export const PATCH = route(async (req) => {
  const { id } = await requireUser(req);
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = meSchema.parse(raw);
  // Only the fields the request actually sent.
  const patch = Object.fromEntries(Object.entries(parsed).filter(([key]) => key in raw));
  const stored = await store.get<StoredUser>("users", id);
  if (!stored) throw new ApiError("unauthorized");
  const next: StoredUser = { ...stored, ...patch, updatedAt: new Date().toISOString() };
  await store.set("users", id, next);
  return json({ user: publicUser(next) });
});
