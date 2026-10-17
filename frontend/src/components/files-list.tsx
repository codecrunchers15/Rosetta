import type { FileChange } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Additions and deletions are context, not status: no green or red. */
export function FilesList({ files, className }: { files: FileChange[]; className?: string }) {
  return (
    <section id="files" aria-labelledby="files-heading" className={cn("scroll-mt-36", className)}>
      <h2 id="files-heading" className="t-heading text-fg-1">
        Files changed
      </h2>
      <ul className="mt-4">
        {files.map((file) => (
          <li key={file.path}>
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              title={file.path}
              className="-mx-3 flex min-h-11 items-center justify-between gap-6 rounded-sm px-3 t-code transition-[background-color] duration-150 hover:bg-surface-1"
            >
              <span className="min-w-0 truncate text-fg-2">{file.path}</span>
              <span className="shrink-0 text-fg-3 tabular-nums">
                +{file.additions} −{file.deletions}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
