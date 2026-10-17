import { z } from "zod";
import { checkPassword, issueToken, publicUser, userIdFor } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({ email: z.email().trim().toLowerCase(), password: z.string().min(1).max(200) });

/** POST /api/auth/login { email, password } → { token, user } */
export const POST = route(async (req) => {
  const { email, password } = await readJson(req, body);
  const user = await store.get<StoredUser>("users", userIdFor(email));
  // Same answer for an unknown email and a wrong password.
  if (!user || !(await checkPassword(password, user.passwordHash ?? ""))) {
    throw new ApiError("invalid_credentials", "That email and password don't match.");
  }
  return json({ token: issueToken(user.id), user: publicUser(user) });
});
