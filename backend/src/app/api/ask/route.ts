import { randomUUID } from "node:crypto";
import { z } from "zod";
import { answerQuestion } from "@/lib/ai/tasks";
import { optionalUser } from "@/lib/auth";
import { diffText, trimFiles } from "@/lib/diff";
import { env } from "@/lib/env";
import { filesFor, postComment } from "@/lib/github";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { StoredCard, StoredQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({
  cardId: z.string(),
  nodeId: z.string(),
  nodeKey: z.string(),
  level: z.enum(["engineer", "senior", "intern", "manager", "client", "mom"]),
  question: z.string().trim().min(1).max(500),
  send: z.boolean().optional(),
  technicalQuestion: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/ask
 * Without `send`: answer from the diff, or return a technical rewrite for the
 * reader to approve (FR-4.2, 4.3). With `send: true`: post it to GitHub.
 */
export const POST = route(async (req) => {
  const input = await readJson(req, body);
  const card = await store.get<StoredCard>("cards", input.cardId);
  if (!card) throw new ApiError("not_found");
  const user = await optionalUser(req);

  if (!input.send) {
    // The diff is re-fetched, never stored. Demo cards may have no live repo.
    const files = await filesFor(card).catch(() => []);
    const result = await answerQuestion({
      explanation: card.explanation,
      level: input.level,
      nodeKey: input.nodeKey,
      question: input.question,
      diff: files.length ? diffText(trimFiles(files, env.maxDiffLines).files) : "(diff unavailable; use the explanation)",
    });
    return json(
      result.answerable
        ? { answerable: true, answer: result.answer }
        : { answerable: false, technicalQuestion: result.technical_question },
    );
  }

  if (!input.technicalQuestion) throw new ApiError("bad_request", "technicalQuestion is required when sending.");
  const step = card.explanation.levels.engineer.labels[input.nodeKey] ?? input.nodeKey;
  const who = user ? `${user.name}${user.title ? ` (${user.title})` : ""}` : "A reader";
  const comment = await postComment(
    card,
    [
      "**[Rosetta]** A reader has a question about this change.",
      "",
      `> ${input.technicalQuestion.replace(/\n/g, "\n> ")}`,
      "",
      `${who} asked this while reading the \`${step}\` step. Their words: "${input.question}"`,
      "",
      "Reply in this thread and Rosetta will translate your answer for them.",
    ].join("\n"),
  );

  const question: StoredQuestion = {
    id: `q_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    cardId: card.id,
    nodeId: input.nodeId,
    nodeKey: input.nodeKey,
    level: input.level,
    question: input.question,
    technicalQuestion: input.technicalQuestion,
    askedBy: user ? { id: user.id, name: user.name } : undefined,
    githubCommentId: comment.id,
    commentUrl: comment.html_url,
    commentCreatedAt: comment.created_at,
    status: "waiting",
    createdAt: new Date().toISOString(),
  };
  await store.set("questions", question.id, question);
  return json({ questionId: question.id, commentUrl: comment.html_url });
});
