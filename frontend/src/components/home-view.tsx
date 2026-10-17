"use client";

import { LayoutGroup, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApiError, explain } from "@/lib/api";
import { ERROR_COPY } from "@/lib/errors";
import { describeLink, EXAMPLE_LINK, parseGitHubLink } from "@/lib/github-url";
import { SAMPLES } from "@/lib/mock/samples";
import type { ApiErrorCode } from "@/lib/types";
import { Button, buttonStyles } from "./button";
import { GitHubIcon } from "./icons";
import { InkTexture } from "./ink-texture";
import { LinkInput } from "./link-input";
import { LoadingStory } from "./loading-story";
import { MiniDemo } from "./mini-demo";
import { Nav } from "./nav";
import { ThemeToggle } from "./theme-toggle";

const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/code-crunchers/rosetta";

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; title?: string; findings: string[]; writing: boolean };

const layoutTransition = { duration: 0.32, ease: [0.23, 1, 0.32, 1] as const };

export function HomeView() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<ApiErrorCode | null>(null);

  const link = parseGitHubLink(value);
  const loading = phase.kind === "loading";

  const start = async (url: string) => {
    if (loading) return;
    if (!parseGitHubLink(url)) {
      setError("invalid_url");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setPhase({ kind: "loading", findings: [], writing: false });
    try {
      const card = await explain(url, (event) =>
        setPhase((p) => {
          if (p.kind !== "loading") return p;
          if (event.type === "start") return { ...p, title: event.title };
          if (event.type === "finding") return { ...p, findings: [...p.findings, event.text] };
          return { ...p, writing: true };
        }),
      );
      router.push(`/c/${card.id}`);
    } catch (e) {
      setPhase({ kind: "idle" });
      const code = e instanceof ApiError ? e.code : "unavailable";
      setError(code);
      if (ERROR_COPY[code].action === "focus") inputRef.current?.focus();
    }
  };

  const onValueChange = (next: string) => {
    setValue(next);
    if (error === "invalid_url" && parseGitHubLink(next)) setError(null);
  };

  // Paste validates instantly: a chip for a good link, the error line for a bad one.
  const onPasteValue = (pasted: string) => {
    setValue(pasted);
    setError(parseGitHubLink(pasted) ? null : "invalid_url");
  };

  const trySample = (index = 0) => {
    const sample = SAMPLES[index];
    setValue(sample.url);
    void start(sample.url);
  };

  const errorCopy = error ? ERROR_COPY[error] : null;

  return (
    <>
      <Nav>
        <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "ghost" })}>
          <GitHubIcon />
          <span className="max-[400px]:sr-only">GitHub</span>
        </a>
        <ThemeToggle />
      </Nav>

      <main>
        <section className="relative isolate overflow-hidden">
          <InkTexture className="pointer-events-none absolute inset-0 -z-10 size-full" />
          <div className="mx-auto flex min-h-[calc(100svh-var(--nav-h)-8rem)] max-w-[56rem] flex-col items-center justify-center px-(--gutter) py-16 text-center">
            <LayoutGroup>
              <motion.h1 layout="position" transition={layoutTransition} className="t-display text-balance text-fg-1">
                Explain any commit to anyone.
              </motion.h1>

              {!loading && (
                <motion.p
                  layout="position"
                  transition={layoutTransition}
                  className="mt-6 max-w-[34rem] t-body text-balance text-fg-2"
                >
                  Paste a GitHub link. Rosetta turns the change into a story your manager, client or mom can follow.
                </motion.p>
              )}

              <motion.div layout="position" transition={layoutTransition} className="mt-10 w-full max-w-(--w-read)">
                <LinkInput
                  value={value}
                  onValueChange={onValueChange}
                  onPasteValue={onPasteValue}
                  onSubmit={() => start(value)}
                  loading={loading}
                  invalid={error === "invalid_url"}
                  describedBy={errorCopy ? "link-status" : undefined}
                  inputRef={inputRef}
                />

                <div id="link-status" className="mt-3 min-h-8 text-left">
                  {errorCopy ? (
                    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                      <p className="t-small font-medium text-fg-1">{errorCopy.message}</p>
                      {errorCopy.action === "example" && (
                        <p className="t-small text-fg-2">
                          Links look like <span className="font-mono">{EXAMPLE_LINK}</span>
                        </p>
                      )}
                      {errorCopy.action === "sample" && (
                        <Button variant="ghost" className="-ml-2 h-8!" onClick={() => trySample()}>
                          Try a sample
                        </Button>
                      )}
                      {errorCopy.action === "retry" && (
                        <Button variant="ghost" className="-ml-2 h-8!" onClick={() => start(value)}>
                          Try again
                        </Button>
                      )}
                    </div>
                  ) : (
                    link &&
                    !loading && (
                      <span className="inline-flex h-8 items-center gap-2 rounded-xs bg-surface-2 px-3 t-small text-fg-2">
                        <span className="text-fg-1">{describeLink(link).repo}</span>
                        <span aria-hidden>·</span>
                        <span className="font-mono">{describeLink(link).ref}</span>
                      </span>
                    )
                  )}
                </div>
              </motion.div>

              {loading ? (
                <motion.div layout="position" transition={layoutTransition} className="mt-4 w-full max-w-(--w-read) px-1">
                  <LoadingStory title={phase.title} findings={phase.findings} writing={phase.writing} />
                </motion.div>
              ) : (
                <motion.div
                  layout="position"
                  transition={layoutTransition}
                  className="mt-1 flex flex-wrap items-center justify-center gap-2"
                >
                  <span className="t-small text-fg-3">Try:</span>
                  {SAMPLES.map((sample, i) => (
                    <button
                      key={sample.key}
                      type="button"
                      onClick={() => trySample(i)}
                      className="press h-8 rounded-xs bg-surface-2 px-3 t-small font-medium text-fg-2 hover:bg-(--surface-3) hover:text-fg-1 pointer-coarse:h-11"
                    >
                      {sample.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </LayoutGroup>
          </div>
        </section>

        {!loading && (
          <section aria-label="Example" className="mx-auto max-w-(--w-read) px-(--gutter) pb-24">
            <MiniDemo />
          </section>
        )}
      </main>

      <footer className="mx-auto flex max-w-(--w-app) items-center justify-between gap-4 px-(--gutter) pb-10 t-small text-fg-3">
        <p>Built for Devlympics 2026</p>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-xs transition-[color] duration-150 hover:text-fg-1"
        >
          Source code
        </a>
      </footer>
    </>
  );
}
