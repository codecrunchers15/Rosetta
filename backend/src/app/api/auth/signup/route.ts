import { randomBytes } from "node:crypto";
import { hashPassword, issueToken, publicUser, userIdFor } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { signupSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { Org, StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * POST /api/auth/signup → 201 { token, user, org }
 * Creates a workspace with its first person (a CMO or a manager) at the top.
 * Everyone else joins through an invite from their lead.
 */
export const POST = route(async (req) => {
  const { password, orgName, ...profile } = await readJson(req, signupSchema);
  const id = userIdFor(profile.email);
  if (await store.get<StoredUser>("users", id)) {
    throw new ApiError("conflict", "An account with this email already exists. Log in instead.");
  }
  const now = new Date().toISOString();
  const org: Org = {
    id: `o_${randomBytes(6).toString("hex")}`,
    name: orgName,
    ownerId: id,
    repos: [],
    webhookSecret: randomBytes(20).toString("hex"),
    createdAt: now,
  };
  const user: StoredUser = {
    ...profile,
    id,
    orgId: org.id,
    status: "active",
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };
  await store.set("orgs", org.id, org);
  await store.set("users", id, user);
  return json({ token: issueToken(id), user: publicUser(user), org: { id: org.id, name: org.name } }, 201);
});
