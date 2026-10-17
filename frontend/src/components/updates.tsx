"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { useSession } from "@/lib/session";
import type { CommentView, Feed } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Page } from "./app-shell";
import { FilterChips, personChip } from "./feed";
import { GitHubIcon } from "./icons";
import { Avatar, PersonLine } from "./person";

/** Engineers' comments for leads, filterable by engineer and (for a CMO) by team. */
export function Updates() {
  const { user } = useSession();
  const [author, setAuthor] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [items, setItems] = useState<CommentView[] | null>(null);
  const [filters, setFilters] = useState<Pick<Feed, "people" | "teams"> | null>(null);
  const [original, setOriginal] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getFeed().then((f) => setFilters({ people: f.people, teams: f.teams })).catch(() => {});
  }, []);
  useEffect(() => {
    setItems(null);
    api
      .getComments({ author: author ?? undefined, team: team ?? undefined })
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [author, team]);

  const people = (filters?.people ?? []).filter((p) => !team || p.team?.id === team);

  return (
    <Page
      title="Engineer updates"
      lead={`What your engineers wrote about their work, here and on GitHub, rewritten for ${user?.role === "cmo" ? "a CMO" : "a manager"}.`}
    >
      <div className="grid gap-3">
        {user?.role === "cmo" && filters && (
          <FilterChips
            label="Team"
            options={filters.teams}
            value={team}
            onChange={(id) => {
              setTeam(id);
              setAuthor(null);
            }}
            render={(t) => t.name}
          />
        )}
        {filters && <FilterChips label="Engineer" options={people} value={author} onChange={setAuthor} render={personChip} />}
      </div>

      <div className="mt-8">
        {!items ? (
          <p className="t-body text-fg-3">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-md p-8 shadow-ring">
            <p className="t-body font-medium text-fg-1">No updates here yet.</p>
            <p className="mt-1 t-small text-fg-2">
              Engineers&rsquo; comments on their changes, and their GitHub comments in watched repositories, appear here.
            </p>
          </div>
        ) : (
          <ul className="grid max-w-[52rem] gap-3">
            {items.map((c) => {
              const showOriginal = original.has(c.id);
              return (
                <li key={c.id} className="flex gap-4 rounded-md bg-surface-1 p-5 shadow-elev-1">
                  <Avatar name={c.author?.name ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 t-small text-fg-3">
                      <PersonLine person={c.author} className="text-fg-3" />
                      <span aria-hidden>·</span>
                      <span>{timeAgo(c.createdAt)}</span>
                      {c.source === "github" && (
                        <a href={c.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg-1">
                          <GitHubIcon size={12} /> on GitHub
                        </a>
                      )}
                    </p>
                    <p className="mt-2 t-body text-fg-1">{showOriginal ? c.original : c.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 t-micro text-fg-3">
                      {c.card && (
                        <Link href={`/app/c/${c.card.id}`} className="hover:text-fg-1">
                          On &ldquo;{c.card.title}&rdquo;
                        </Link>
                      )}
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
                          className="underline underline-offset-4 hover:text-fg-1"
                        >
                          {showOriginal ? "Show it for me" : "Show what they wrote"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Page>
  );
}
