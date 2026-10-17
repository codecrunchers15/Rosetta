import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { descendants, orgMembers, personOf } from "@/lib/org";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().max(80).optional(),
  githubLogin: z
    .union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9-]{1,39}$/, "That isn't a GitHub username.")])
    .optional(),
  teamName: z.string().trim().max(80).optional(),
});

/** PATCH /api/team/members/:id: a lead fixes someone's title, GitHub username or team name. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const users = await orgMembers(me.orgId);
  const member = users.find((u) => u.id === id);
  if (!member) throw new ApiError("not_found");
  const manages = me.role === "cmo" || descendants(me.id, users).some((u) => u.id === id);
  if (!manages) throw new ApiError("forbidden", "You can only edit people on your team.");

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = patchSchema.parse(raw);
  const next: StoredUser = {
    ...member,
    ...Object.fromEntries(Object.entries(parsed).filter(([k]) => k in raw).map(([k, v]) => [k, v || undefined])),
    updatedAt: new Date().toISOString(),
  };
  await store.set("users", id, next);
  return json({ member: personOf(next, users.map((u) => (u.id === id ? next : u))) });
});
