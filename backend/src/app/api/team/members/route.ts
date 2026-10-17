import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { publicUser, requireUser, userIdFor } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { CAN_ADD, descendants, orgMembers, personOf, requireOrg } from "@/lib/org";
import { mailConfigured, sendInvite } from "@/lib/mail";
import { memberSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Readable invite codes: no 0/O or 1/I. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const inviteCode = () => [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join("");

/**
 * POST /api/team/members → 201 { member, inviteCode }
 * A CMO adds managers (or anyone); a manager adds engineers, interns and
 * clients under themselves. The new person joins with the invite code.
 */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const input = await readJson(req, memberSchema);
  if (!CAN_ADD[me.role].includes(input.role)) {
    throw new ApiError("forbidden", `A ${me.role} can't add a ${input.role}.`);
  }

  const users = await orgMembers(org.id);
  // Default: under me. A CMO may place someone under one of their managers.
  let managerId = me.id;
  if (input.managerId && input.managerId !== me.id) {
    const allowed = descendants(me.id, users).some((u) => u.id === input.managerId && u.role === "manager");
    if (!allowed) throw new ApiError("forbidden", "You can only add people under yourself or a manager below you.");
    managerId = input.managerId;
  }

  const id = userIdFor(input.email);
  if (await store.get("users", id)) throw new ApiError("conflict", "Someone with this email already has an account.");

  const code = inviteCode();
  const now = new Date().toISOString();
  const member: StoredUser = {
    id,
    orgId: org.id,
    email: input.email,
    name: input.name,
    role: input.role,
    managerId,
    title: input.title,
    githubLogin: input.githubLogin,
    teamName: input.role === "manager" ? input.teamName : undefined,
    focus: [],
    language: "en",
    status: "invited",
    inviteCode: code,
    createdAt: now,
    updatedAt: now,
  };
  await store.set("users", id, member);
  await store.set("invites", code, { userId: id, orgId: org.id });
  const emailed = mailConfigured() && !member.email.endsWith("@demo.rosetta.dev");
  if (emailed) {
    after(() => sendInvite({ to: member.email, name: member.name, inviter: me.name, orgName: org.name, role: member.role, code }));
  }
  return json({ member: personOf(publicUser(member), [...users, member]), inviteCode: code, emailed }, 201);
});
