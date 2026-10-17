import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import { ticketDetail } from "@/lib/tickets";
import { translated } from "@/lib/translate";
import type { StoredCard, Ticket, User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, me: User) {
  const ticket = await store.get<Ticket>("tickets", id);
  if (!ticket || (ticket.fromId !== me.id && ticket.toId !== me.id)) throw new ApiError("not_found");
  const [users, card] = await Promise.all([
    orgMembers(me.orgId),
    ticket.context ? store.get<StoredCard>("cards", ticket.context.cardId) : null,
  ]);
  return { ticket, users, card };
}

/** GET /api/tickets/:id: the thread at my level; marks it read. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const { ticket, users, card } = await load(id, me);
  if (ticket.unreadBy.includes(me.id)) {
    ticket.unreadBy = ticket.unreadBy.filter((u) => u !== me.id);
    await store.set("tickets", id, ticket);
  }
  return json({ ticket: ticketDetail(ticket, me, users, card) });
});

/** POST /api/tickets/:id { text }: reply. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const { text } = await readJson(req, z.object({ text: z.string().trim().min(1).max(2000) }));
  const { ticket, users, card } = await load(id, me);
  const now = new Date().toISOString();
  const otherId = ticket.fromId === me.id ? ticket.toId : ticket.fromId;
  ticket.messages.push({
    id: `tm_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    authorId: me.id,
    createdAt: now,
    ...(await translated(text, me.name, card?.explanation.title ?? ticket.subject)),
  });
  // The person asked replying means it's answered; the asker following up reopens it.
  ticket.status = me.id === ticket.toId ? "answered" : "open";
  ticket.unreadBy = [otherId];
  ticket.updatedAt = now;
  await store.set("tickets", id, ticket);
  return json({ ticket: ticketDetail(ticket, me, users, card) });
});

/** PATCH /api/tickets/:id { status }: close or reopen. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const { status } = await readJson(req, z.object({ status: z.enum(["open", "closed"]) }));
  const { ticket, users, card } = await load(id, me);
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  await store.set("tickets", id, ticket);
  return json({ ticket: ticketDetail(ticket, me, users, card) });
});
