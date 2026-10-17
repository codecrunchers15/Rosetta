"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { FeedItem, Person } from "@/lib/types";
import { cn, firstName, timeAgo } from "@/lib/utils";
import { Avatar, PersonLine } from "./person";
import { RiskBadge } from "./risk-badge";

export function StatTile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "attention" }) {
  return (
    <div className="rounded-md bg-surface-1 px-5 py-4 shadow-elev-1">
      <p className="t-small text-fg-2">{label}</p>
      <p className={cn("mt-1 font-display text-[2rem] leading-none font-semibold tabular-nums", tone === "attention" && value > 0 ? "text-(--risk-medium)" : "text-fg-1")}>
        {value}
      </p>
      {hint && <p className="mt-2 t-small text-fg-3">{hint}</p>}
    </div>
  );
}

/** One change in a feed, already written at the reader's level. */
export function FeedCard({ item, showAuthor = true }: { item: FeedItem; showAuthor?: boolean }) {
  const author = item.author;
  return (
    <li>
      <Link
        href={`/app/c/${item.id}`}
        className="press group block rounded-md bg-surface-1 p-5 shadow-elev-1 transition-[box-shadow,transform] duration-150 hover:shadow-elev-2 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {showAuthor && <Avatar name={item.authorName} />}
            <div className="min-w-0">
              <h3 className="t-body font-semibold text-pretty text-fg-1">{item.title}</h3>
              <p className="mt-0.5 t-small text-fg-3">
                {showAuthor && (
                  <>
                    <PersonLine person={author} fallback={item.authorName} className="text-fg-3" />
                    <span aria-hidden> · </span>
                  </>
                )}
                <time dateTime={item.committedAt}>{timeAgo(item.committedAt)}</time>
              </p>
            </div>
          </div>
          <RiskBadge risk={item.risk} />
        </div>
        <p className="mt-4 max-w-[66ch] t-body text-pretty text-fg-2">{item.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 t-micro">
          {item.status === "approved" ? (
            <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 text-fg-2">
              Reviewed by {firstName(item.authorName)}
            </span>
          ) : (
            <span className="inline-flex h-6 items-center rounded-xs bg-[color-mix(in_srgb,var(--risk-medium)_12%,transparent)] px-2 text-(--risk-medium)">
              Not reviewed yet
            </span>
          )}
          {item.source === "sync" || item.source === "webhook" ? (
            <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 text-fg-3">Arrived from GitHub</span>
          ) : null}
          {item.comments > 0 && (
            <span className="text-fg-3">
              {item.comments} {item.comments === 1 ? "comment" : "comments"}
            </span>
          )}
          {item.openQuestions > 0 && (
            <span className="text-fg-3">
              · {item.openQuestions} open {item.openQuestions === 1 ? "question" : "questions"}
            </span>
          )}
          <span className="ml-auto font-mono text-fg-3">
            {item.repo.split("/")[1]} · {item.ref}
          </span>
        </div>
      </Link>
    </li>
  );
}

export function FeedList({ items, empty, showAuthor }: { items: FeedItem[]; empty: ReactNode; showAuthor?: boolean }) {
  if (!items.length) return <div className="rounded-md p-8 text-center shadow-ring">{empty}</div>;
  return (
    <ul className="grid grid-cols-1 gap-3">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} showAuthor={showAuthor} />
      ))}
    </ul>
  );
}

/** Pill filters: All, then one per person or team. */
export function FilterChips<T extends { id: string }>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: T[];
  value: string | null;
  onChange: (id: string | null) => void;
  render: (option: T) => ReactNode;
}) {
  if (!options.length) return null;
  const chip = (active: boolean) =>
    cn(
      "press inline-flex h-9 items-center gap-2 rounded-full px-3.5 t-small font-medium shadow-ring",
      active ? "bg-(--btn-primary-bg) text-(--btn-primary-fg)" : "bg-surface-1 text-fg-2 hover:text-fg-1",
    );
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 t-small text-fg-3">{label}</span>
      <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
        Everyone
      </button>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} className={chip(value === o.id)} onClick={() => onChange(o.id)}>
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export const personChip = (p: Person) => (
  <>
    <Avatar name={p.name} size={22} />
    {p.name.split(" ")[0]}
  </>
);
