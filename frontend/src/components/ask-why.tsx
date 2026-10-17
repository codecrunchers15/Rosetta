"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Drawer } from "vaul";
import { ApiError, ask, createTicket } from "@/lib/api";
import type { CardView, Person } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { firstName } from "@/lib/utils";
import { Button } from "./button";
import type { AskTarget } from "./flowchart";
import { CloseIcon } from "./icons";
import { Spinner } from "./spinner";

type Thread =
  | { step: "asking"; question: string }
  | { step: "answered"; question: string; answer: string }
  | { step: "confirm"; question: string; technicalQuestion: string; askTo: Person | null; sending?: boolean }
  | { step: "sent"; question: string; ticketId: string; to: string }
  | { step: "error"; question: string; message: string };

const keyOf = (t: AskTarget) => `${t.panel}:${t.nodeId}`;

type Props = { card: CardView; target: AskTarget | null; open: boolean; onClose: () => void };

/** Ask why a step works the way it does. Code answers first; the engineer answers the rest. */
export function AskWhy({ card, target, open, onClose }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const content = target && (
    <AskContent
      key={keyOf(target)}
      card={card}
      target={target}
      thread={threads[keyOf(target)]}
      setThread={(t) =>
        setThreads((all) => {
          const next = { ...all };
          if (t) next[keyOf(target)] = t;
          else delete next[keyOf(target)];
          return next;
        })
      }
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
    <Sheet open={open} onClose={onClose} titleId={titleId} inputRef={inputRef}>
      {content}
    </Sheet>
  );
}

function Sheet({
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

function AskContent({
  card,
  target,
  thread,
  setThread,
  inputRef,
}: {
  card: CardView;
  target: AskTarget;
  thread: Thread | undefined;
  setThread: (thread: Thread | undefined) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [question, setQuestion] = useState("");
  const level = card.explanation.levels[card.viewer.level];
  const stepLabel = level.labels[target.key] ?? target.key;

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q || thread?.step === "asking") return;
    setThread({ step: "asking", question: q });
    try {
      const result = await ask({ cardId: card.id, nodeKey: target.key, question: q });
      setThread(
        result.answerable
          ? { step: "answered", question: q, answer: result.answer }
          : { step: "confirm", question: q, technicalQuestion: result.technicalQuestion, askTo: result.askTo },
      );
      setQuestion("");
    } catch (error) {
      setThread({
        step: "error",
        question: q,
        message:
          error instanceof ApiError && error.code === "unavailable"
            ? "Rosetta can't answer questions right now. Try again in a minute."
            : "That didn't work. Try again in a minute.",
      });
    }
  };

  const send = async () => {
    if (thread?.step !== "confirm" || !thread.askTo || thread.sending) return;
    setThread({ ...thread, sending: true });
    try {
      const { ticket } = await createTicket({
        toId: thread.askTo.id,
        subject: `About “${card.explanation.title}”`,
        text: thread.question,
        context: { cardId: card.id, nodeKey: target.key, technicalQuestion: thread.technicalQuestion },
      });
      setThread({ step: "sent", question: thread.question, ticketId: ticket.id, to: thread.askTo.name });
    } catch {
      setThread({ step: "error", question: thread.question, message: "That didn't send. Try again in a minute." });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(question);
  };

  return (
    <div className="grid gap-6">
      <div>
        <p className="t-small text-fg-2">Asking about</p>
        <p className="mt-1 t-heading text-fg-1">{stepLabel}</p>
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
          placeholder={`Why does “${stepLabel}” work this way?`}
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
                className="press h-8 rounded-xs bg-surface-2 px-3 t-small font-medium text-fg-1 hover:bg-(--surface-3) pointer-coarse:h-11"
              >
                {s}
              </button>
            ))}
          </div>
          <Button type="submit" variant={thread?.step === "confirm" ? "secondary" : "primary"} loading={thread?.step === "asking"} disabled={!question.trim()}>
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
            <p className="t-small text-fg-2">Answered from the code in this change.</p>
          </div>
        )}
        {thread?.step === "confirm" &&
          (thread.askTo ? (
            <div className="grid gap-3">
              <p className="t-body font-medium text-fg-1">
                The code can&rsquo;t answer this. Send it to {firstName(thread.askTo.name)}, who wrote the change?
              </p>
              <p className="t-small text-fg-2">
                {firstName(thread.askTo.name)} gets your words plus a technical version, and you&rsquo;ll read the reply in Questions.
              </p>
              <div className="flex gap-2">
                <Button variant="primary" onClick={send} loading={thread.sending}>
                  Ask {firstName(thread.askTo.name)}
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
          ) : (
            <p className="t-body font-medium text-fg-1">The code can&rsquo;t answer this, and the author isn&rsquo;t in your workspace yet.</p>
          ))}
        {thread?.step === "sent" && (
          <div className="grid gap-2">
            <p className="t-body font-medium text-fg-1">Sent to {firstName(thread.to)}. You&rsquo;ll see the reply in Questions.</p>
            <Link href={`/app/questions/${thread.ticketId}`} className="t-small font-medium text-fg-1 underline underline-offset-4">
              Open the conversation
            </Link>
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
