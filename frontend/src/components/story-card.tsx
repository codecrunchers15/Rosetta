"use client";

import type { ReactNode } from "react";
import { LEVELS, type LevelKey } from "@/lib/levels";
import type { EditableField, Explanation } from "@/lib/types";
import { Editable } from "./editable";
import { LevelSwap } from "./level-swap";

type Props = {
  explanation: Explanation;
  active: number;
  fileCount: number;
  editable: boolean;
  onEdit: (level: LevelKey, field: EditableField, value: string) => void;
  /** The flowchart, placed after the analogy on narrow screens. */
  afterAnalogy?: ReactNode;
};

/**
 * Solid reading surface: summary → analogy → what changes → files.
 * Each level's text swaps as one block, so the card is as tall as its
 * longest level and any spare room sits at the bottom, not between sections.
 */
export function StoryCard({ explanation, active, fileCount, editable, onEdit, afterAnalogy }: Props) {
  const field = (level: LevelKey, isActive: boolean, name: EditableField, label: string, className: string) => (
    <Editable
      value={explanation.levels[level][name]}
      editable={editable && isActive}
      label={`${label} for ${LEVELS.find((l) => l.key === level)!.label}`}
      onCommit={(value) => onEdit(level, name, value)}
      className={className}
    />
  );

  const story = (level: LevelKey, isActive: boolean) => (
    <>
      {field(level, isActive, "summary", "Summary", "t-summary text-pretty text-fg-1")}
      <div className="relative mt-6 pl-4 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:rounded-full before:bg-steel">
        {field(level, isActive, "analogy", "Analogy", "t-body text-fg-2")}
      </div>
    </>
  );

  const changes = (level: LevelKey, isActive: boolean) => (
    <>
      <h3 className="t-heading text-fg-1">What changes</h3>
      <div className="mt-2">{field(level, isActive, "impact", "What changes", "t-body text-fg-2")}</div>
    </>
  );

  return (
    <article className="flex h-full flex-col rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      {afterAnalogy ? (
        <>
          <LevelSwap active={active} className="max-w-[66ch]" render={story} />
          <div className="mt-8">{afterAnalogy}</div>
          <LevelSwap active={active} className="mt-8 max-w-[66ch]" render={changes} />
        </>
      ) : (
        <LevelSwap
          active={active}
          className="max-w-[66ch]"
          render={(level, isActive) => (
            <>
              {story(level, isActive)}
              <div className="mt-6">{changes(level, isActive)}</div>
            </>
          )}
        />
      )}

      <a
        href="#files"
        className="mt-auto self-start pt-6 t-small font-medium text-fg-2 underline decoration-(--ring-strong) underline-offset-4 transition-[color,text-decoration-color] duration-150 hover:text-fg-1 hover:decoration-current"
      >
        {fileCount === 1 ? "1 file changed" : `${fileCount} files changed`}
      </a>
    </article>
  );
}
