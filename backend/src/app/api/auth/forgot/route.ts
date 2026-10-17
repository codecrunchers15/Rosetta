import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { userIdFor } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { mailConfigured, sendPasswordReset } from "@/lib/mail";
import { RESET_TTL_MS, resetId, type Reset } from "@/lib/resets";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * POST /api/auth/forgot { email } → always { sent: true }
 * The same answer whether or not the account exists, so nobody can probe
 * which emails are registered.
 */
export const POST = route(async (req) => {
  if (!mailConfigured()) throw new ApiError("unavailable", "Email isn't set up on this server yet.");
  const { email } = await readJson(req, z.object({ email: z.email().trim().toLowerCase() }));
  const user = await store.get<StoredUser>("users", userIdFor(email));

  if (user && user.status === "active" && user.passwordHash) {
    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    await store.set("resets", resetId(token), { userId: user.id, expiresAt: now + RESET_TTL_MS, createdAt: now } satisfies Reset);
    after(() => sendPasswordReset({ to: user.email, name: user.name, token }));
  }
  return json({ sent: true });
});
