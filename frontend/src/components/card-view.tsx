"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, approve, getCard } from "@/lib/api";
import { applyEdits, hasEdits } from "@/lib/edits";
import { CARD_DEFAULT_LEVEL, LEVELS, type LevelKey, type LevelSource, type LevelState } from "@/lib/levels";
import type { ApiErrorCode, Card, CardEdits, EditableField } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn, firstName, timeAgo } from "@/lib/utils";
import { AskWhy } from "./ask-why";
import { BridgeSlider } from "./bridge-slider";
import { Button, buttonStyles } from "./button";
import { Editable } from "./editable";
import { FilesList } from "./files-list";
import { Flowchart, type AskTarget } from "./flowchart";
import { LinkIcon } from "./icons";
import { Nav } from "./nav";
import { RiskBadge } from "./risk-badge";
import { StoryCard } from "./story-card";
import { ThemeToggle } from "./theme-toggle";

type State = { status: "loading" } | { status: "error"; code: ApiErrorCode } | { status: "ready"; card: Card };

export function CardView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getCard(id)
      .then((card) => !cancelled && setState({ status: "ready", card }))
      .catch((e) => !cancelled && setState({ status: "error", code: e instanceof ApiError ? e.code : "unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "ready") {
    return <LoadedCard card={state.card} onCardChange={(card) => setState({ status: "ready", card })} />;
  }

  return (
    <>
      <Nav>
        <ThemeToggle />
      </Nav>
      <main className="mx-auto max-w-(--w-app) px-(--gutter) py-24">
        {state.status === "loading" ? (
          <p className="t-body text-fg-3" role="status">
            Opening the card…
          </p>
        ) : (
          <div className="grid max-w-(--w-read) justify-items-start gap-6">
            <h1 className="t-title text-fg-1">
              {state.code === "not_found" ? "No card found at this link." : "This card can't be opened right now."}
            </h1>
            <p className="t-body text-fg-2">
              {state.code === "not_found"
                ? "It may not have been approved yet. Ask the engineer for a fresh link, or explain the commit yourself."
                : "Explanations are unavailable right now. Try again in a minute."}
            </p>
            <Link href="/" className={buttonStyles({ variant: "primary" })}>
              Explain a commit
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

function LoadedCard({ card, onCardChange }: { card: Card; onCardChange: (card: Card) => void }) {
  const wide = useMediaQuery("(min-width: 900px)", true);
  const [level, setLevelState] = useState<LevelState>({ index: CARD_DEFAULT_LEVEL, source: "program" });
  const [edits, setEdits] = useState<CardEdits>({});
  const [approving, setApproving] = useState(false);
  const [ask, setAsk] = useState<{ open: boolean; target: AskTarget | null }>({ open: false, target: null });
  const docked = useDocked();

  const reviewing = card.status === "draft";
  const explanation = applyEdits(card.explanation, edits);
  const setLevel = useCallback((index: number, source: LevelSource) => setLevelState({ index, source }), []);
  const closeAsk = useCallback(() => setAsk((a) => ({ ...a, open: false })), []);

  const editField = (key: LevelKey, field: EditableField, value: string) =>
    setEdits((e) => ({ ...e, levels: { ...e.levels, [key]: { ...e.levels?.[key], [field]: value } } }));

  const shortRef = card.ref.kind === "commit" ? card.ref.sha.slice(0, 7) : `#${card.ref.number}`;

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  };

  const onApprove = async () => {
    setApproving(true);
    try {
      const { card: approved, shareUrl } = await approve(card.id, edits);
      const copied = await copyLink(shareUrl);
      setEdits({});
      onCardChange(approved);
      toast(copied ? "Approved. Link copied." : "Approved.", copied ? undefined : { description: shareUrl });
    } catch {
      toast("Explanations are unavailable right now. Try again in a minute.");
    } finally {
      setApproving(false);
    }
  };

  const onShare = async () => {
    const url = `${window.location.origin}/c/${card.id}`;
    toast((await copyLink(url)) ? "Link copied." : url);
  };

  const flowchart = (
    <Flowchart
      explanation={explanation}
      active={level.index}
      embedded={!wide}
      onAsk={(target) => setAsk({ open: true, target })}
    />
  );

  const activeLevel = LEVELS[level.index];

  return (
    <div data-swap-source={level.source === "keyboard" ? "keyboard" : undefined}>
      <Nav
        meta={
          <>
            {card.repo} · <span className="font-mono">{shortRef}</span>
          </>
        }
      >
        {!reviewing && (
          <Button onClick={onShare}>
            <LinkIcon />
            Share
          </Button>
        )}
        <ThemeToggle />
      </Nav>

      {/* Sticky dock: the slider follows you down the page. */}
      <div
        data-visible={docked.isDocked}
        inert={!docked.isDocked}
        className="materialize glass glass-flat fixed inset-x-0 top-(--nav-h) z-30 h-14"
      >
        <div className="mx-auto flex h-full max-w-(--w-app) items-center gap-6 px-(--gutter)">
          <span className="w-24 shrink-0 t-small font-semibold text-fg-1">{activeLevel.label}</span>
          <BridgeSlider variant="dock" value={level.index} source={level.source} onChange={setLevel} />
        </div>
      </div>

      <main className={cn("mx-auto max-w-(--w-app) px-(--gutter) pt-12", reviewing ? "pb-40" : "pb-24")}>
        <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1 basis-[28rem]">
            <Editable
              as="h1"
              value={explanation.title}
              editable={reviewing}
              label="Title"
              onCommit={(title) => setEdits((e) => ({ ...e, title }))}
              className="t-title text-pretty text-fg-1 break-words"
            />
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 t-small text-fg-3">
              <span>{card.author.name}</span>
              <span aria-hidden>·</span>
              <span>
                {card.ref.kind === "pull" ? "merged" : "committed"}{" "}
                <time dateTime={card.committedAt}>{timeAgo(card.committedAt)}</time>
              </span>
              <span aria-hidden>·</span>
              {reviewing ? (
                <span>Draft</span>
              ) : (
                <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 t-micro text-fg-2">
                  Approved by {firstName(card.approvedBy ?? card.author.name)}
                </span>
              )}
            </p>
          </div>
          <RiskBadge risk={explanation.risk} reason={explanation.riskReason} />
        </header>

        <div ref={docked.ref} className="mt-8 rounded-md bg-surface-1 px-6 pt-5 pb-7 shadow-elev-1 sm:px-8">
          <BridgeSlider variant="full" value={level.index} source={level.source} onChange={setLevel} />
        </div>

        {card.truncated && (
          <p className="mt-6 t-small text-fg-2">
            This change is large, so Rosetta summarized the {card.truncated.shownFiles} most changed files.
          </p>
        )}

        <p className="sr-only" aria-live="polite">
          {activeLevel.label}: {explanation.levels[activeLevel.key].summary}
        </p>

        <div className="mt-6 grid gap-6 card:grid-cols-12">
          <div className="card:col-span-7">
            <StoryCard
              explanation={explanation}
              active={level.index}
              fileCount={card.files.length}
              editable={reviewing}
              onEdit={editField}
              afterAnalogy={wide ? undefined : flowchart}
            />
          </div>
          {wide && <div className="card:col-span-5">{flowchart}</div>}
        </div>

        <FilesList files={card.files} className="mt-16" />
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
                <span className="font-semibold">Edit</span>
                <span className="text-fg-2">
                  {" "}
                  · {hasEdits(edits) ? "Your changes are kept until you approve." : "Select any text to change it."}
                </span>
              </p>
              <Button variant="primary" loading={approving} onClick={onApprove}>
                Approve and share
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AskWhy card={{ ...card, explanation }} target={ask.target} level={level.index} open={ask.open} onClose={closeAsk} />
    </div>
  );
}

/** True once the slider has scrolled up under the nav. */
function useDocked() {
  const [isDocked, setDocked] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const ref = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    const navHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 64;
    observer.current = new IntersectionObserver(
      ([entry]) => setDocked(!entry.isIntersecting && entry.boundingClientRect.top < navHeight),
      { rootMargin: `-${navHeight}px 0px 0px 0px` },
    );
    observer.current.observe(el);
  }, []);

  return { ref, isDocked };
}
