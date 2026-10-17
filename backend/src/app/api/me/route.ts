import { requireUser } from "@/lib/auth";
import { json, preflight, readJson, route } from "@/lib/http";
import { profileSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/me → { user } */
export const GET = route(async (req) => json({ user: await requireUser(req) }));

/** PATCH /api/me { …profile fields } → { user }. The email is the identity and stays fixed. */
export const PATCH = route(async (req) => {
  const user = await requireUser(req);
  const patch = await readJson(req, profileSchema.omit({ email: true }).partial());
  const next: User = { ...user, ...patch, updatedAt: new Date().toISOString() };
  await store.set("users", user.id, next);
  return json({ user: next });
});
