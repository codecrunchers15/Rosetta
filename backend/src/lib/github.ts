import { env } from "./env";
import type { ParsedLink } from "./github-url";
import { ApiError } from "./http";
import type { CardRef, StoredCard } from "./types";

const API = "https://api.github.com";

export type RawFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url: string;
};

export type Change = {
  repo: string;
  ref: CardRef;
  headSha: string;
  url: string;
  subject: string;
  message: string;
  author: { name: string; login: string };
  committedAt: string;
  files: RawFile[];
};

class GitHubError extends Error {
  constructor(public status: number) {
    super(`GitHub responded ${status}`);
  }
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "rosetta-devlympics",
        ...(env.githubToken ? { Authorization: `Bearer ${env.githubToken}` } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new GitHubError(res.status);
  return res.json() as Promise<T>;
}

/** A missing commit in a visible repo is "not found"; an invisible repo is private. */
async function explainMissing(owner: string, repo: string): Promise<never> {
  try {
    await gh(`/repos/${owner}/${repo}`);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) throw new ApiError("private");
    throw new ApiError("unavailable");
  }
  throw new ApiError("not_found");
}

function mapError(error: unknown, link: ParsedLink): Promise<never> {
  if (error instanceof GitHubError) {
    if (error.status === 404 || error.status === 422) return explainMissing(link.owner, link.repo);
    if (error.status === 401 || error.status === 403 || error.status === 429) {
      console.warn(
        `[rosetta] GitHub refused the request (${error.status}).${env.githubToken ? "" : " Set GITHUB_TOKEN: the anonymous limit is 60 requests an hour."}`,
      );
      throw new ApiError("unavailable");
    }
  }
  throw error;
}

type CommitResponse = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
  author: { login: string } | null;
  files?: RawFile[];
};

type PullResponse = {
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  merged_at: string | null;
  user: { login: string };
  head: { sha: string };
};

/** Commit or PR metadata and changed files (FR-1.3). */
export async function fetchChange(link: ParsedLink): Promise<Change> {
  const repo = `${link.owner}/${link.repo}`;
  try {
    if (link.kind === "commit") {
      const c = await gh<CommitResponse>(`/repos/${repo}/commits/${link.sha}`);
      return {
        repo,
        ref: { kind: "commit", sha: c.sha },
        headSha: c.sha,
        url: c.html_url,
        subject: c.commit.message.split("\n")[0],
        message: c.commit.message,
        author: { name: c.commit.author.name, login: c.author?.login ?? "" },
        committedAt: c.commit.author.date,
        files: c.files ?? [],
      };
    }

    const [pr, files] = await Promise.all([
      gh<PullResponse>(`/repos/${repo}/pulls/${link.number}`),
      gh<RawFile[]>(`/repos/${repo}/pulls/${link.number}/files?per_page=100`),
    ]);
    const profile = await gh<{ name: string | null }>(`/users/${pr.user.login}`).catch(() => null);
    return {
      repo,
      ref: { kind: "pull", number: link.number },
      headSha: pr.head.sha,
      url: pr.html_url,
      subject: pr.title,
      message: `${pr.title}\n\n${pr.body ?? ""}`.trim(),
      author: { name: profile?.name || pr.user.login, login: pr.user.login },
      committedAt: pr.merged_at ?? pr.created_at,
      files,
    };
  } catch (error) {
    return mapError(error, link);
  }
}

/** Short-lived memory cache: Ask Why needs the diff, but diffs are never stored. */
const diffCache = new Map<string, { at: number; files: RawFile[] }>();

export async function filesFor(card: StoredCard): Promise<RawFile[]> {
  const hit = diffCache.get(card.id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.files;
  const [owner, repo] = card.repo.split("/");
  const link: ParsedLink =
    card.ref.kind === "commit"
      ? { owner, repo, kind: "commit", sha: card.ref.sha }
      : { owner, repo, kind: "pull", number: card.ref.number };
  const { files } = await fetchChange(link);
  diffCache.set(card.id, { at: Date.now(), files });
  return files;
}

export type Comment = { id: number; body: string; html_url: string; created_at: string; user: { login: string } | null };

/** Posts a PR comment or a commit comment (FR-4.3). */
export async function postComment(card: StoredCard, body: string): Promise<Comment> {
  if (!env.githubToken) throw new ApiError("unavailable", "GITHUB_TOKEN is needed to post comments.");
  const path =
    card.ref.kind === "pull"
      ? `/repos/${card.repo}/issues/${card.ref.number}/comments`
      : `/repos/${card.repo}/commits/${card.headSha}/comments`;
  try {
    return await gh<Comment>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
  } catch {
    throw new ApiError("unavailable");
  }
}

export async function commentsAfter(card: StoredCard, afterIso: string): Promise<Comment[]> {
  const comments =
    card.ref.kind === "pull"
      ? await gh<Comment[]>(
          `/repos/${card.repo}/issues/${card.ref.number}/comments?since=${encodeURIComponent(afterIso)}&per_page=100`,
        )
      : await gh<Comment[]>(`/repos/${card.repo}/commits/${card.headSha}/comments?per_page=100`);
  return comments.filter((c) => c.created_at > afterIso);
}
