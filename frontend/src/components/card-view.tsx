"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { applyEdits, hasEdits } from "@/lib/edits";
import { isLead, roleLabel, roleNoun } from "@/lib/roles";
import { useSession } from "@/lib/session";
import type { CardEdits, CardView as CardData, CommentView, EditableField } from "@/lib/types";
import { cn, firstName, timeAgo } from "@/lib/utils";
import { AskWhy } from "./ask-why";
import { Button, buttonStyles } from "./button";
import { Editable } from "./editable";
import { FilesList } from "./files-list";
import { HowItWorks, type AskTarget } from "./flowchart";
import { GitHubIcon } from "./icons";
import { PersonLine } from "./person";
import { RiskBadge } from "./risk-badge";
import { StoryCard } from "./story-card";

type State = { status: "loading" } | { status: "error"; code: string } | { status: "ready"; card: CardData };

export function CardView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .getCard(id)
      .then((card) => !cancelled && setState({ status: "ready", card }))
      .catch((e) => !cancelled && setState({ status: "error", code: e instanceof api.ApiError ? e.code : "unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "ready") return <LoadedCard card={state.card} onCardChange={(card) => setState({ status: "ready", card })} />;

  return (
    <main className="mx-auto max-w-(--w-app) px-(--gutter) py-16">
      {state.status === "loading" ? (
        <p className="t-body text-fg-3" role="status">
          Opening the change…
        </p>
      ) : (
        <div className="grid max-w-(--w-read) justify-items-start gap-6">
          <h1 className="t-title text-fg-1">{state.code === "not_found" ? "This change isn't on your list." : "This change can't be opened right now."}</h1>
          <p className="t-body text-fg-2">
            {state.code === "not_found"
              ? "It may belong to another team, or it was never explained in your workspace."
              : "Rosetta can't reach its server. Try again in a minute."}
          </p>
          <Link href="/app" className={buttonStyles({ variant: "primary" })}>
            Back to your work
          </Link>
        </div>
      )}
    </main>
  );
}

function LoadedCard({ card, onCardChange }: { card: CardData; onCardChange: (card: CardData) => void }) {
  const { user } = useSession();
  const [edits, setEdits] = useState<CardEdits>({});
  const [approving, setApproving] = useState(false);
  const [reexplaining, setReexplaining] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentView[]>(card.comments);
  const [ask, setAsk] = useState<{ open: boolean; target: AskTarget | null }>({ open: false, target: null });

  // The reading level is the viewer's role. It can't be switched: a manager reads the manager version.
  const levelKey = card.viewer.level;
  const reviewing = card.status === "draft" && card.viewer.canReview;
  const explanation = applyEdits(card.explanation, edits);
  const level = explanation.levels[levelKey];
  const closeAsk = useCallback(() => setAsk((a) => ({ ...a, open: false })), []);

  useEffect(() => {
    let cancelled = false;
    api
      .getForMe(card.id)
      .then((r) => !cancelled && setNote(r.note))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  const editField = (field: EditableField, value: string) =>
    setEdits((e) => ({ ...e, levels: { ...e.levels, [levelKey]: { ...e.levels?.[levelKey], [field]: value } } }));

  const onReexplain = async () => {
    setReexplaining(true);
    try {
      const { card: fresh } = await api.reexplain(card.id);
      setEdits({});
      onCardChange({ ...fresh, comments });
      toast("Explained again from the latest code.");
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail : "That didn't work. Try again in a minute.");
    } finally {
      setReexplaining(false);
    }
  };

  const onApprove = async () => {
    setApproving(true);
    try {
      const { card: approved } = await api.approve(card.id, edits);
      setEdits({});
      onCardChange({ ...approved, comments });
      toast("Marked as reviewed. Your manager sees it as checked by you.");
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail : "That didn't save. Try again in a minute.");
    } finally {
      setApproving(false);
    }
  };

  const authorName = card.authorPerson?.name ?? card.author.name;
  const shortRef = card.ref.kind === "commit" ? card.ref.sha.slice(0, 7) : `#${card.ref.number}`;

  return (
    <div>
      <main className={cn("mx-auto max-w-(--w-app) px-(--gutter) pt-10", reviewing ? "pb-40" : "pb-24")}>
        <Link href="/app" className="t-small text-fg-3 hover:text-fg-1">
          Back to your work
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1 basis-[28rem]">
            <Editable
              as="h1"
              value={explanation.title}
              editable={reviewing}
              label="Title"
              onCommit={(title) => setEdits((e) => ({ ...e, title }))}
              className="t-title text-pretty break-words text-fg-1"
            />
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 t-small text-fg-3">
              <PersonLine person={card.authorPerson} fallback={authorName} className="text-fg-3" />
              <span aria-hidden>·</span>
              <time dateTime={card.committedAt}>{timeAgo(card.committedAt)}</time>
              <span aria-hidden>·</span>
              {card.status === "approved" ? (
                <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 t-micro text-fg-2">
                  Reviewed by {firstName(card.approvedBy ?? authorName)}
                </span>
              ) : (
                <span className="inline-flex h-6 items-center rounded-xs bg-[color-mix(in_srgb,var(--risk-medium)_12%,transparent)] px-2 t-micro text-(--risk-medium)">
                  {card.viewer.canReview ? "Waiting for your review" : `Not reviewed by ${firstName(authorName)} yet`}
                </span>
              )}
            </p>
          </div>
          <RiskBadge risk={explanation.risk} reason={explanation.riskReason} />
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <p className="t-small text-fg-2">
            Explained for you as {roleNoun(levelKey)}.
            {reviewing && " This is how you'll read it; your manager gets their own version. Select any text to fix it."}
          </p>
          {(card.viewer.canReview || isLead(levelKey)) && card.source !== "demo" && (
            <Button variant="ghost" className="-mr-4" loading={reexplaining} onClick={onReexplain}>
              Explain again
            </Button>
          )}
        </div>

        <div className="mt-4 grid items-stretch gap-6 card:grid-cols-12">
          <div className="card:col-span-7">
            <StoryCard
              level={level}
              levelLabel={roleLabel(levelKey)}
              fileCount={card.files.length}
              editable={reviewing}
              onEdit={editField}
              note={note && user ? { name: firstName(user.name), text: note } : undefined}
            />
          </div>
          <div className="card:col-span-5">
            <Comments card={card} comments={comments} onAdd={(c) => setComments((all) => [...all, c])} />
          </div>
        </div>

        <div className="mt-6">
          <HowItWorks explanation={explanation} level={level} onAsk={card.viewer.canAsk ? (target) => setAsk({ open: true, target }) : undefined} />
        </div>

        {card.truncated && (
          <p className="mt-6 t-small text-fg-2">This change is large, so Rosetta summarized the {card.truncated.shownFiles} most changed files.</p>
        )}

        <div className="mt-16 flex flex-wrap items-end justify-between gap-4">
          <FilesList files={card.files} className="min-w-0 flex-1" />
        </div>
        <a href={card.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 t-small text-fg-2 hover:text-fg-1">
          <GitHubIcon size={14} />
          <span className="font-mono">
            {card.repo} · {shortRef}
          </span>
        </a>
      </main>

      <AnimatePresence>
        {reviewing && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16, transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] } }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-x-0 bottom-0 z-30 px-(--gutter) pb-[max(env(safe-area-inset-bottom),16px)]"
          >
            <div className="glass mx-auto flex max-w-(--w-app) items-center justify-between gap-4 rounded-lg py-3 pr-3 pl-6">
              <p className="t-small text-fg-1">
                <span className="font-semibold">Your change</span>
                <span className="text-fg-2">
                  {" "}
                  · {hasEdits(edits) ? "Your fixes are kept until you mark it reviewed." : "Check it reads right, then mark it reviewed."}
                </span>
              </p>
              <Button variant="primary" loading={approving} onClick={onApprove}>
                Mark as reviewed
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AskWhy card={{ ...card, explanation }} target={ask.target} open={ask.open} onClose={closeAsk} />
    </div>
  );
}

/** Engineers' notes on the change, each at the reader's level. */
function Comments({ card, comments, onAdd }: { card: CardData; comments: CommentView[]; onAdd: (c: CommentView) => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const technical = card.viewer.canComment;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      onAdd((await api.addComment(card.id, text.trim())).comment);
      setText("");
    } catch {
      toast("That comment didn't save. Try again in a minute.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="comments-heading" className="flex h-full flex-col rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      <h2 id="comments-heading" className="t-heading text-fg-1">
        {technical ? "Comments" : "From the engineers"}
      </h2>
      {!technical && <p className="mt-1 t-small text-fg-3">Their notes, rewritten for you.</p>}
      {comments.length === 0 ? (
        <p className="mt-4 t-small text-fg-2">{technical ? "No comments yet. Add context your manager should know." : "No notes on this change yet."}</p>
      ) : (
        <ul className="mt-4 grid gap-5">
          {comments.map((c) => {
            const showOriginal = original.has(c.id);
            return (
              <li key={c.id} className="grid gap-1">
                <p className="flex flex-wrap items-center gap-x-2 t-small text-fg-3">
                  <PersonLine person={c.author} className="text-fg-3" />
                  <span aria-hidden>·</span>
                  <span>{timeAgo(c.createdAt)}</span>
                  {c.source === "github" && c.githubUrl && (
                    <a href={c.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg-1">
                      <GitHubIcon size={12} /> GitHub
                    </a>
                  )}
                </p>
                <p className="t-body text-fg-1">{showOriginal ? c.original : c.text}</p>
                {c.translated && (
                  <button
                    type="button"
                    onClick={() =>
                      setOriginal((s) => {
                        const next = new Set(s);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                    className="justify-self-start t-micro text-fg-3 underline underline-offset-4 hover:text-fg-1"
                  >
                    {showOriginal ? "Show it for me" : "Show what they wrote"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {technical && (
        <form onSubmit={onSubmit} className="mt-auto grid gap-2 pt-6">
          <label htmlFor="new-comment" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="new-comment"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Context for your manager: follow-ups, risks, what's next"
            className="w-full resize-none rounded-sm bg-surface-2 px-3 py-2.5 t-body text-fg-1 shadow-ring-strong outline-none placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)]"
          />
          <Button type="submit" loading={sending} disabled={!text.trim()} className="justify-self-end">
            Add comment
          </Button>
        </form>
      )}
    </section>
  );
}
