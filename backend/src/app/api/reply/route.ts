import { aiConfigured } from "@/lib/ai/provider";
import { translateReply } from "@/lib/ai/tasks";
import { commentsAfter } from "@/lib/github";
import { ApiError, json, preflight, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { StoredCard, StoredQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Readers poll every 15 s; GitHub is checked at most this often per question. */
const MIN_CHECK_MS = 10_000;

/** GET /api/reply?questionId= (FR-4.4) */
export const GET = route(async (req) => {
  const questionId = new URL(req.url).searchParams.get("questionId");
  if (!questionId) throw new ApiError("bad_request", "questionId is required.");
  const question = await store.get<StoredQuestion>("questions", questionId);
  if (!question) throw new ApiError("not_found");

  const answered = (q: StoredQuestion) =>
    json({ status: "answered", reply: q.reply, translatedReply: q.translatedReply ?? q.reply });
  if (question.status === "answered") return answered(question);

  const now = Date.now();
  if (question.lastCheckedAt && now - new Date(question.lastCheckedAt).getTime() < MIN_CHECK_MS) {
    return json({ status: "waiting" });
  }
  const card = await store.get<StoredCard>("cards", question.cardId);
  if (!card) throw new ApiError("not_found");

  const comments = await commentsAfter(card, question.commentCreatedAt).catch(() => []);
  const reply = comments.find((c) => c.id !== question.githubCommentId && !c.body.includes("[Rosetta]"));
  if (!reply) {
    await store.set("questions", question.id, { ...question, lastCheckedAt: new Date(now).toISOString() });
    return json({ status: "waiting" });
  }

  const engineer = card.author.name.split(/\s+/)[0] || "The engineer";
  const translatedReply = aiConfigured()
    ? await translateReply(reply.body, question.level, engineer).catch(() => reply.body)
    : reply.body;
  const done: StoredQuestion = { ...question, status: "answered", reply: reply.body, translatedReply };
  await store.set("questions", question.id, done);
  return answered(done);
});
