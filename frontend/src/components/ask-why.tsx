"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Drawer } from "vaul";
import { ApiError, ask, getReply, sendToEngineer } from "@/lib/api";
import { ERROR_COPY } from "@/lib/errors";
import { LEVELS, type LevelKey } from "@/lib/levels";
import type { Card } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { firstName } from "@/lib/utils";
import { Button } from "./button";
import type { AskTarget } from "./flowchart";
import { CloseIcon } from "./icons";
import { Spinner } from "./spinner";

const POLL_MS = 15_000;

type Thread =
  | { step: "asking"; question: string; level: LevelKey }
  | { step: "answered"; question: string; level: LevelKey; answer: string }
  | { step: "confirm"; question: string; level: LevelKey; technicalQuestion: string; sending?: boolean }
  | {
      step: "waiting";
      question: string;
      level: LevelKey;
      technicalQuestion: string;
      questionId: string;
      commentUrl?: string;
    }
  | { step: "replied"; question: string; level: LevelKey; reply: string; translatedReply: string }
  | { step: "error"; question: string; level: LevelKey; message: string };

const threadKey = (t: AskTarget) => `${t.panel}:${t.nodeId}`;

type Props = {
  card: Card;
  target: AskTarget | null;
  level: number;
  open: boolean;
  onClose: () => void;
};

export function AskWhy({ card, target, level, open, onClose }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const setThread = (key: string, thread: Thread | undefined) =>
    setThreads((all) => {
      const next = { ...all };
      if (thread) next[key] = thread;
      else delete next[key];
      return next;
    });

  // Poll GitHub for the engineer's reply every 15 s (FR-4.4), even while closed.
  const waiting = Object.entries(threads).filter(
    (entry): entry is [string, Extract<Thread, { step: "waiting" }>] => entry[1].step === "waiting",
  );
  const waitingKey = waiting.map(([, t]) => t.questionId).join(",");
  useEffect(() => {
    if (!waitingKey) return;
    const timer = window.setInterval(() => {
      for (const [key, thread] of waiting) {
        getReply(thread.questionId)
          .then((result) => {
            if (result.status !== "answered") return;
            setThreads((all) => ({
              ...all,
              [key]: {
                step: "replied",
                question: thread.question,
                level: thread.level,
                reply: result.reply,
                translatedReply: result.translatedReply,
              },
            }));
          })
          .catch(() => {
            /* try again on the next tick */
          });
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey]);

  const content = target && (
    <AskWhyContent
      key={threadKey(target)}
      card={card}
      target={target}
      level={LEVELS[level].key}
      thread={threads[threadKey(target)]}
      setThread={(t) => setThread(threadKey(target), t)}
      inputRef={inputRef}
    />
  );

  if (!desktop) {
    return (
      <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-abyss/40" />
          <Drawer.Content
            aria-describedby={undefined}
            className="glass glass-thick fixed inset-x-0 bottom-0 z-50 flex max-h-[85svh] flex-col rounded-t-lg pb-[env(safe-area-inset-bottom)] outline-none"
          >
            <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-(--ring-strong)" />
            <Drawer.Title className="px-6 pt-4 t-heading text-fg-1">Ask why</Drawer.Title>
            <div className="overflow-y-auto px-6 pt-4 pb-6">{content}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <DesktopSheet open={open} onClose={onClose} titleId={titleId} inputRef={inputRef}>
      {content}
    </DesktopSheet>
  );
}

/** Glass side sheet from the right. No scrim: the card stays readable. */
function DesktopSheet({
  open,
  onClose,
  titleId,
  inputRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  children: ReactNode;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      root.removeAttribute("data-sheet-open");
      returnFocus.current?.focus({ preventScroll: true });
      returnFocus.current = null;
      return;
    }
    root.setAttribute("data-sheet-open", "");
    returnFocus.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, inputRef]);

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-open={open}
      inert={!open}
      className="sheet glass glass-thick fixed top-[calc(var(--nav-h)+8px)] right-0 bottom-2 z-50 flex w-[420px] max-w-[calc(100vw-16px)] flex-col rounded-l-lg"
    >
      <div className="flex items-center justify-between gap-4 py-4 pr-4 pl-6">
        <h2 id={titleId} className="t-heading text-fg-1">
          Ask why
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
    </aside>
  );
}

const SUGGESTIONS = ["Why was this needed?", "Will this delay the launch?"];

function AskWhyContent({
  card,
  target,
  level,
  thread,
  setThread,
  inputRef,
}: {
  card: Card;
  target: AskTarget;
  level: LevelKey;
  thread: Thread | undefined;
  setThread: (thread: Thread | undefined) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [question, setQuestion] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const engineer = firstName(card.author.name);
  const nodeLabel = card.explanation.levels[level].labels[target.key] ?? target.key;
  const input = { cardId: card.id, nodeId: target.nodeId, nodeKey: target.key, level };

  const fail = (q: string, lvl: LevelKey, error: unknown) =>
    setThread({
      step: "error",
      question: q,
      level: lvl,
      message: ERROR_COPY[error instanceof ApiError ? error.code : "unavailable"].message,
    });

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q || thread?.step === "asking") return;
    setThread({ step: "asking", question: q, level });
    try {
      const result = await ask({ ...input, question: q });
      setThread(
        result.answerable
          ? { step: "answered", question: q, level, answer: result.answer }
          : { step: "confirm", question: q, level, technicalQuestion: result.technicalQuestion },
      );
      setQuestion("");
    } catch (error) {
      fail(q, level, error);
    }
  };

  const send = async () => {
    if (thread?.step !== "confirm" || thread.sending) return;
    setThread({ ...thread, sending: true });
    try {
      const sent = await sendToEngineer({
        ...input,
        level: thread.level,
        question: thread.question,
        technicalQuestion: thread.technicalQuestion,
      });
      setThread({
        step: "waiting",
        question: thread.question,
        level: thread.level,
        technicalQuestion: thread.technicalQuestion,
        questionId: sent.questionId,
        commentUrl: sent.commentUrl,
      });
    } catch (error) {
      fail(thread.question, thread.level, error);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(question);
  };

  const confirming = thread?.step === "confirm";

  return (
    <div className="grid gap-6">
      <div>
        <p className="t-small text-fg-2">Asking about</p>
        <p className="mt-1 t-heading text-fg-1">{nodeLabel}</p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3">
        <label htmlFor={`ask-${target.nodeId}`} className="sr-only">
          Your question
        </label>
        <textarea
          id={`ask-${target.nodeId}`}
          ref={inputRef}
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(question);
            }
          }}
          placeholder={`Why does “${nodeLabel}” work this way?`}
          className="w-full resize-none rounded-sm bg-surface-1 px-3 py-2.5 t-body text-fg-1 shadow-ring-strong outline-none placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  void submit(s);
                }}
                className="press h-8 rounded-xs bg-surface-2 px-3 t-small font-medium text-fg-1 enabled:hover:bg-(--surface-3) pointer-coarse:h-11"
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            type="submit"
            variant={confirming ? "secondary" : "primary"}
            loading={thread?.step === "asking"}
            disabled={!question.trim()}
          >
            Ask
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="grid gap-4">
        {thread && thread.step !== "asking" && (
          <p className="t-small text-fg-2">
            You asked: <span className="text-fg-1">{thread.question}</span>
          </p>
        )}

        {thread?.step === "asking" && (
          <p className="flex items-center gap-2 t-small font-medium text-fg-1">
            <Spinner /> Reading the code
          </p>
        )}

        {thread?.step === "answered" && (
          <div className="grid gap-2">
            <p className="t-body font-medium text-fg-1">{thread.answer}</p>
            <p className="t-small text-fg-2">Answered from the code in this commit.</p>
          </div>
        )}

        {thread?.step === "confirm" && (
          <div className="grid gap-3">
            <p className="t-body font-medium text-fg-1">
              The code can&rsquo;t answer this, so Rosetta will ask {engineer} on GitHub:
            </p>
            <blockquote className="rounded-sm bg-surface-1 px-4 py-3 t-small text-fg-1 shadow-ring">
              {thread.technicalQuestion}
            </blockquote>
            <div className="flex gap-2">
              <Button variant="primary" onClick={send} loading={thread.sending}>
                Ask {engineer}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setQuestion(thread.question);
                  setThread(undefined);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {thread?.step === "waiting" && (
          <div className="grid gap-2">
            <p className="t-body font-medium text-fg-1">
              Sent to {engineer} on GitHub. You&rsquo;ll see the reply here.
            </p>
            <p className="flex items-center gap-2 t-small text-fg-2">
              <Spinner size={14} /> Checking for a reply every 15 seconds
            </p>
            {thread.commentUrl && (
              <a
                href={thread.commentUrl}
                target="_blank"
                rel="noreferrer"
                className="t-small font-medium text-fg-1 underline decoration-(--ring-strong) underline-offset-4 hover:decoration-current"
              >
                View the comment on GitHub
              </a>
            )}
          </div>
        )}

        {thread?.step === "replied" && (
          <div className="grid gap-3">
            <p className="t-small text-fg-2">{engineer} replied</p>
            <p className="t-body font-medium text-fg-1">{thread.translatedReply}</p>
            {showOriginal && (
              <p className="rounded-sm bg-surface-1 px-4 py-3 t-small text-fg-1 shadow-ring">{thread.reply}</p>
            )}
            <Button variant="ghost" className="-ml-4 justify-self-start" onClick={() => setShowOriginal((s) => !s)}>
              {showOriginal ? "Hide original" : "Show original"}
            </Button>
          </div>
        )}

        {thread?.step === "error" && (
          <div className="grid gap-3">
            <p className="t-body font-medium text-fg-1">{thread.message}</p>
            <Button className="justify-self-start" onClick={() => submit(thread.question)}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
