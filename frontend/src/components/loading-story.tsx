"use client";

import { motion } from "motion/react";
import { Fragment } from "react";
import { CheckIcon } from "./icons";
import { Spinner } from "./spinner";

const enter = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const },
};

/** Backticks mark code names, which render in Geist Mono. */
export function InlineCode({ text }: { text: string }) {
  return text.split("`").map((part, i) =>
    i % 2 ? (
      <code key={i} className="font-mono text-[0.9375em] text-fg-2">
        {part}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * The wait explains the work: lines come from the diff itself, before the
 * AI call returns (FR-6.1).
 */
export function LoadingStory({ title, findings, writing }: { title?: string; findings: string[]; writing: boolean }) {
  return (
    <div className="w-full text-left" role="status" aria-live="polite">
      <motion.p {...enter} className="t-heading text-fg-1">
        Reading {title ?? "the commit"}…
      </motion.p>
      <ul className="mt-4 grid gap-2">
        {findings.map((line, i) => (
          <motion.li key={i} {...enter} className="flex items-center gap-3 t-body text-fg-1">
            <CheckIcon className="shrink-0 text-steel" />
            <span>
              <InlineCode text={line} />
            </span>
          </motion.li>
        ))}
        {writing && (
          <motion.li {...enter} className="flex items-center gap-3 t-body text-fg-1">
            <Spinner className="text-fg-2" />
            Writing explanations for six readers
          </motion.li>
        )}
      </ul>
    </div>
  );
}
