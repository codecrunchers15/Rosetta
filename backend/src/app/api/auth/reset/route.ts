import { z } from "zod";
import { hashPassword, issueToken, publicUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";
import { resetId, type Reset } from "@/lib/resets";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "That reset link isn't valid."),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
});

/** POST /api/auth/reset { token, password } → { token, user }: sets the new password and logs in. */
export const POST = route(async (req) => {
  const { token, password } = await readJson(req, body);
  const id = resetId(token);
  const reset = await store.get<Reset>("resets", id);
  if (!reset || reset.expiresAt < Date.now()) {
    if (reset) await store.remove("resets", id);
    throw new ApiError("not_found", "This reset link has expired. Ask for a new one.");
  }
  const user = await store.get<StoredUser>("users", reset.userId);
  if (!user) throw new ApiError("not_found", "This account no longer exists.");

  const next: StoredUser = { ...user, passwordHash: await hashPassword(password), updatedAt: new Date().toISOString() };
  await store.set("users", user.id, next);
  await store.remove("resets", id); // one use only
  return json({ token: issueToken(user.id), user: publicUser(next) });
});
