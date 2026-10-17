import { issueToken, userIdFor } from "@/lib/auth";
import { json, preflight, readJson, route } from "@/lib/http";
import { profileSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * POST /api/auth/login { name, email, role, … } → { token, user, created }
 * Creates the profile card, or updates it when the email already exists.
 */
export const POST = route(async (req) => {
  const profile = await readJson(req, profileSchema);
  const id = userIdFor(profile.email);
  const existing = await store.get<User>("users", id);
  const now = new Date().toISOString();
  const user: User = { ...existing, ...profile, id, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await store.set("users", id, user);
  return json({ token: issueToken(id), user, created: !existing });
});
