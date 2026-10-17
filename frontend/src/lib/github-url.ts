export type ParsedLink =
  | { owner: string; repo: string; kind: "commit"; sha: string }
  | { owner: string; repo: string; kind: "pull"; number: number };

const LINK =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(commit|pull)\/([0-9a-f]{7,40}|\d+)(?:[/?#].*)?$/i;

/** Accepts commit and pull request links (FR-1.1). */
export function parseGitHubLink(input: string): ParsedLink | null {
  const match = input.trim().match(LINK);
  if (!match) return null;
  const [, owner, repo, kind, id] = match;
  if (kind.toLowerCase() === "commit") {
    if (!/^[0-9a-f]{7,40}$/i.test(id)) return null;
    return { owner, repo, kind: "commit", sha: id.toLowerCase() };
  }
  if (!/^\d+$/.test(id)) return null;
  return { owner, repo, kind: "pull", number: Number(id) };
}

export function describeLink(link: ParsedLink) {
  const ref = link.kind === "commit" ? link.sha.slice(0, 7) : `#${link.number}`;
  return { repo: `${link.owner}/${link.repo}`, ref };
}

export const EXAMPLE_LINK = "github.com/owner/repo/commit/a3f9c2e";
