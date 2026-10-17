import { requireUser } from "@/lib/auth";
import { json, preflight, route } from "@/lib/http";
import { CAN_ADD, canMessage, descendants, isLead, orgMembers, personOf, requireOrg } from "@/lib/org";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/team → the workspace as this person sees it: who they manage,
 * who they can message, and (for leads) invite codes and repo settings.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const users = await orgMembers(org.id);
  const managed = new Set(descendants(me.id, users).map((u) => u.id));
  const lead = isLead(me.role);

  const members = users
    .filter((u) => u.id !== me.id)
    .map((u) => {
      const manages = me.role === "cmo" || managed.has(u.id);
      return {
        ...personOf(u, users),
        email: manages ? u.email : undefined,
        reports: users.filter((x) => x.managerId === u.id).length,
        manages,
        canMessage: canMessage(me, u, users),
        inviteCode: manages && u.status === "invited" ? u.inviteCode : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({
    me: personOf(me, users),
    canAdd: CAN_ADD[me.role],
    members,
    org: {
      id: org.id,
      name: org.name,
      ownerId: org.ownerId,
      repos: org.repos,
      lastSyncAt: org.lastSyncAt ?? null,
      ...(lead ? { webhookPath: `/api/webhooks/github?org=${org.id}`, webhookSecret: org.webhookSecret } : {}),
    },
  });
});
