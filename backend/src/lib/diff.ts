import type { RawFile } from "./github";

/**
 * Keeps the most-changed files until the line budget is spent (FR-1.4).
 * Always keeps at least one file.
 */
export function trimFiles(files: RawFile[], maxLines: number) {
  const sorted = [...files].sort((a, b) => b.changes - a.changes);
  const kept: RawFile[] = [];
  let lines = 0;
  for (const file of sorted) {
    if (kept.length && lines + file.changes > maxLines) continue;
    kept.push(file);
    lines += file.changes;
  }
  return { files: kept, truncated: kept.length < files.length };
}

const MAX_PATCH_CHARS = 6_000;

/** The diff as the model sees it. */
export function diffText(files: RawFile[]) {
  return files
    .map((f) => {
      const patch = f.patch
        ? f.patch.length > MAX_PATCH_CHARS
          ? `${f.patch.slice(0, MAX_PATCH_CHARS)}\n… (patch cut)`
          : f.patch
        : "(binary or too large to show)";
      return `--- ${f.filename} (${f.status}, +${f.additions} −${f.deletions})\n${patch}`;
    })
    .join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Loading-screen findings: real facts from the diff (FR-6.1)          */
/* ------------------------------------------------------------------ */

const DECLARATIONS = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/,
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
  /^\s*(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?[\w<>[\],\s]+?\s+([A-Za-z_]\w*)\s*\(/,
];

const declared = (line: string) => {
  for (const pattern of DECLARATIONS) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const SENSITIVE: [RegExp, string][] = [
  [/pay|billing|charge|invoice|checkout/i, "payment"],
  [/auth|login|session|token|password/i, "login"],
  [/migrat|schema|\.sql$/i, "database"],
];

export function findings(all: RawFile[], kept: RawFile[]): string[] {
  const lines = [all.length === 1 ? "Found 1 changed file" : `Found ${all.length} changed files`];

  const added = new Set<string>();
  const changed = new Set<string>();
  for (const file of kept) {
    for (const line of (file.patch ?? "").split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        const name = declared(line.slice(1));
        if (name) added.add(name);
      } else if (line.startsWith("@@")) {
        const context = line.replace(/^@@[^@]*@@/, "");
        const name = declared(context);
        if (name) changed.add(name);
      }
    }
  }
  for (const name of added) changed.delete(name);

  const newFiles = all.filter((f) => f.status === "added");
  const removed = all.filter((f) => f.status === "removed");

  if (added.size) {
    const names = [...added].slice(0, 2).map((n) => `\`${n}()\``);
    lines.push(`${added.size === 1 ? "New function" : "New functions"}: ${names.join(", ")}`);
  }
  if (newFiles.length && lines.length < 4) lines.push(`New file: \`${newFiles[0].filename}\``);
  if (changed.size && lines.length < 4) lines.push(`\`${[...changed][0]}()\` changed`);
  if (removed.length && lines.length < 4) lines.push(`Removed \`${removed[0].filename}\``);

  for (const [pattern, area] of SENSITIVE) {
    const hit = all.find((f) => pattern.test(f.filename));
    if (hit && lines.length < 5) {
      lines.push(`Touches ${area} code in \`${hit.filename}\``);
      break;
    }
  }
  if (lines.length === 1 && kept[0]) lines.push(`Biggest change in \`${kept[0].filename}\``);
  return lines;
}
