import { createHash } from "node:crypto";
import { z } from "zod";
import { aiConfigured } from "@/lib/ai/provider";
import { explainChange } from "@/lib/ai/tasks";
import { optionalUser } from "@/lib/auth";
import { cardIdFor, demoSampleFor, publicCard } from "@/lib/cards";
import { diffText, findings as findingsFrom, trimFiles } from "@/lib/diff";
import { env } from "@/lib/env";
import { fetchChange, type Change } from "@/lib/github";
import { parseGitHubLink } from "@/lib/github-url";
import { ApiError, ndjson, pause, preflight, readJson, route } from "@/lib/http";
import { store } from "@/lib/store";
import type { Explanation, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const FINDING_GAP_MS = 300;
const cacheId = (repo: string, sha: string) =>
  createHash("sha256").update(`${repo}@${sha}`.toLowerCase()).digest("hex").slice(0, 24);

/** POST /api/explain { url } → NDJSON: start, finding…, writing, card. */
export const POST = route(async (req) => {
  const { url } = await readJson(req, z.object({ url: z.string().max(500) }));
  const link = parseGitHubLink(url);
  if (!link) throw new ApiError("invalid_url");
  const user = await optionalUser(req);
  const id = cardIdFor(link);
  const repo = `${link.owner}/${link.repo}`;

  // Already explained: replay the story, no GitHub or model calls.
  const existing = await store.get<StoredCard>("cards", id);
  if (existing) {
    return ndjson(async (emit) => {
      emit({ type: "start", title: existing.reading });
      for (const text of existing.findings) {
        await pause(FINDING_GAP_MS / 2);
        emit({ type: "finding", text });
      }
      return publicCard(existing, user);
    });
  }

  const demo = link.kind === "commit" ? demoSampleFor(repo, link.sha) : undefined;
  let change: Change | null = null;
  try {
    change = await fetchChange(link);
  } catch (error) {
    // Demo commits still work with no Wi-Fi or GitHub (PRD risk table).
    if (!demo) throw error;
  }

  if (!change && demo) {
    return ndjson(async (emit) => {
      emit({ type: "start", title: demo.reading });
      for (const text of demo.findings) {
        await pause(FINDING_GAP_MS);
        emit({ type: "finding", text });
      }
      const now = new Date().toISOString();
      const card: StoredCard = {
        ...demo.card,
        id,
        status: "draft",
        committedAt: now,
        headSha: demo.sha,
        reading: demo.reading,
        findings: demo.findings,
        createdBy: user?.id,
        createdAt: now,
      };
      await store.set("cards", id, card);
      return publicCard(card, user);
    });
  }

  const c = change!;
  const { files: kept, truncated } = trimFiles(c.files, env.maxDiffLines);
  const lines = findingsFrom(c.files, kept);
  const reading = `“${c.subject.length > 60 ? `${c.subject.slice(0, 57)}…` : c.subject}”`;

  return ndjson(async (emit) => {
    emit({ type: "start", title: reading });

    // Start the model while the findings play.
    const explanationPromise = (async (): Promise<Explanation> => {
      const cached = await store.get<Explanation>("explanations", cacheId(repo, c.headSha));
      if (cached) return cached;
      if (demo) return demo.card.explanation;
      if (!aiConfigured()) throw new ApiError("unavailable", "No AI key configured.");
      const generated = await explainChange({
        repo,
        message: c.message,
        files: kept.map((f) => f.filename),
        diff: diffText(kept),
        truncated,
      });
      const explanation = { ...generated, files: kept.map((f) => f.filename) };
      await store.set("explanations", cacheId(repo, c.headSha), explanation);
      return explanation;
    })();
    explanationPromise.catch(() => {});

    for (const text of lines) {
      await pause(FINDING_GAP_MS);
      emit({ type: "finding", text });
    }
    emit({ type: "writing" });

    const explanation = await explanationPromise;
    const now = new Date().toISOString();
    const card: StoredCard = {
      id,
      repo,
      ref: c.ref,
      url: c.url,
      author: c.author,
      committedAt: c.committedAt,
      status: "draft",
      files: kept.map((f) => ({ path: f.filename, additions: f.additions, deletions: f.deletions, url: f.blob_url })),
      ...(truncated ? { truncated: { shownFiles: kept.length } } : {}),
      explanation,
      headSha: c.headSha,
      reading,
      findings: lines,
      createdBy: user?.id,
      createdAt: now,
    };
    await store.set("cards", id, card);
    return publicCard(card, user);
  });
});
