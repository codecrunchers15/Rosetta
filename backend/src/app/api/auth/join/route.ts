import { hashPassword, issueToken, publicUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { joinSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Invite = { userId: string; orgId: string };

/** POST /api/auth/join { code, password, …profile } → { token, user } */
export const POST = route(async (req) => {
  const { code, password, ...profile } = await readJson(req, joinSchema);
  const invite = await store.get<Invite>("invites", code.toUpperCase());
  const user = invite && (await store.get<StoredUser>("users", invite.userId));
  if (!invite || !user || user.status !== "invited") {
    throw new ApiError("not_found", "That invite code isn't valid. Ask your manager for a new one.");
  }
  const now = new Date().toISOString();
  const active: StoredUser = {
    ...user,
    ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
    status: "active",
    passwordHash: await hashPassword(password),
    inviteCode: undefined,
    updatedAt: now,
  };
  await store.set("users", user.id, active);
  await store.remove("invites", code.toUpperCase());
  return json({ token: issueToken(user.id), user: publicUser(active) });
});
