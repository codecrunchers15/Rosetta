import { ApiError, json, preflight, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { Org, StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ code: string }> };

/** GET /api/invites/:code → who is invited, to prefill the join page. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { code } = await params;
  const invite = await store.get<{ userId: string; orgId: string }>("invites", code.toUpperCase());
  const user = invite && (await store.get<StoredUser>("users", invite.userId));
  if (!invite || !user || user.status !== "invited") throw new ApiError("not_found", "That invite code isn't valid.");
  const [org, manager] = await Promise.all([
    store.get<Org>("orgs", invite.orgId),
    user.managerId ? store.get<StoredUser>("users", user.managerId) : null,
  ]);
  return json({
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title,
    githubLogin: user.githubLogin,
    orgName: org?.name ?? "",
    invitedBy: manager?.name ?? null,
  });
});
