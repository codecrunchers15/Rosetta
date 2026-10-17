import { createHash } from "node:crypto";
import { aiConfigured } from "@/lib/ai/provider";
import { personalNote } from "@/lib/ai/tasks";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { StoredCard, User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };
type Note = { text: string; profileHash: string; explanationHash: string };

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const profileHash = (u: User) => hash([u.role, u.title, u.organization, u.focus, u.language, u.name]);

/**
 * GET /api/cards/:id/for-me → { level, note }
 * The default level comes from the reader's profile; the note is a
 * two-sentence "what this means for you", cached per card and profile.
 */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(req);
  const card = await store.get<StoredCard>("cards", id);
  if (!card) throw new ApiError("not_found");

  const noteId = `${id}_${user.id}`;
  const keys = { profileHash: profileHash(user), explanationHash: hash(card.explanation.levels[user.role]) };
  const cached = await store.get<Note>("notes", noteId);
  if (cached && cached.profileHash === keys.profileHash && cached.explanationHash === keys.explanationHash) {
    return json({ level: user.role, note: cached.text });
  }

  let note: string | null = null;
  if (aiConfigured()) {
    note = await personalNote(card.explanation, user).catch(() => null);
    if (note) await store.set("notes", noteId, { text: note, ...keys } satisfies Note);
  }
  return json({ level: user.role, note });
});
