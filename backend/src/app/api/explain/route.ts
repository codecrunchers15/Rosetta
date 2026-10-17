import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { cardIdFor, demoSampleFor, publicCard } from "@/lib/cards";
import { fetchChange, type Change } from "@/lib/github";
import { parseGitHubLink } from "@/lib/github-url";
import { ApiError, ndjson, pause, preflight, readJson, route } from "@/lib/http";
import { explanationFor, prepare, toCard } from "@/lib/ingest";
import { orgMembers, requireOrg } from "@/lib/org";
import { store } from "@/lib/store";
import type { StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const FINDING_GAP_MS = 300;

/** POST /api/explain { url } → NDJSON: start, finding…, writing, card. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const { url } = await readJson(req, z.object({ url: z.string().max(500) }));
  const link = parseGitHubLink(url);
  if (!link) throw new ApiError("invalid_url");
  const users = await orgMembers(org.id);
  const id = cardIdFor(org.id, link);
  const repo = `${link.owner}/${link.repo}`;

  // Already explained in this workspace: replay the story, no GitHub or model calls.
  const existing = await store.get<StoredCard>("cards", id);
  if (existing) {
    return ndjson(async (emit) => {
      emit({ type: "start", title: existing.reading });
      for (const text of existing.findings) {
        await pause(FINDING_GAP_MS / 2);
        emit({ type: "finding", text });
      }
      return publicCard(existing, me, users);
    });
  }

  const demo = link.kind === "commit" ? demoSampleFor(repo, link.sha) : undefined;
  let change: Change;
  try {
    change = await fetchChange(link);
  } catch (error) {
    // Demo commits still work with no Wi-Fi or GitHub.
    if (!demo) throw error;
    change = {
      repo: demo.card.repo,
      ref: demo.card.ref,
      headSha: demo.sha,
      url: demo.card.url,
      subject: demo.reading,
      message: demo.reading,
      author: demo.card.author,
      committedAt: new Date().toISOString(),
      files: demo.card.files.map((f) => ({
        filename: f.path,
        status: "modified",
        additions: f.additions,
        deletions: f.deletions,
        changes: f.additions + f.deletions,
        blob_url: f.url,
      })),
    };
  }

  const prepared = prepare(change);
  if (demo) {
    prepared.findings = demo.findings;
    prepared.reading = demo.reading;
  }

  return ndjson(async (emit) => {
    emit({ type: "start", title: prepared.reading });
    const explanationPromise = explanationFor(prepared);
    explanationPromise.catch(() => {});
    for (const text of prepared.findings) {
      await pause(FINDING_GAP_MS);
      emit({ type: "finding", text });
    }
    emit({ type: "writing" });
    const card = toCard(id, org, prepared, await explanationPromise, users, { createdBy: me.id, source: "manual" });
    await store.set("cards", id, card);
    return publicCard(card, me, users);
  });
});
