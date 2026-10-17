"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { Mermaid } from "mermaid";
import { changedNodeIds, nextNodes, orderedNodes, toMermaid, widestLabels } from "@/lib/flow";
import { LEVELS, type LevelKey } from "@/lib/levels";
import type { Explanation, FlowGraph, LevelText } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AskTarget = { nodeId: string; key: string; panel: "before" | "after" };

let loader: Promise<{ mermaid: Mermaid; font: string }> | null = null;

function loadMermaid() {
  loader ??= import("mermaid").then(({ default: mermaid }) => {
    const font = getComputedStyle(document.body).fontFamily;
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "strict",
      suppressErrorRendering: true,
      fontFamily: font,
      htmlLabels: true,
      look: "classic",
      themeVariables: {
        fontFamily: font,
        fontSize: "14px",
        background: "transparent",
        primaryColor: "#142F4F",
        primaryTextColor: "#F6FAFD",
        primaryBorderColor: "#4A7FA7",
        lineColor: "#8098AF",
        secondaryColor: "#102642",
        tertiaryColor: "#102642",
      },
      flowchart: {
        curve: "basis",
        nodeSpacing: 32,
        rankSpacing: 40,
        htmlLabels: true,
        wrappingWidth: 120,
        padding: 10,
        useMaxWidth: true,
      },
    });
    return { mermaid, font };
  });
  return loader;
}

type Props = {
  explanation: Explanation;
  active: number;
  onAsk: (target: AskTarget) => void;
  /** Inside the Story Card on narrow screens: no surface of its own. */
  embedded?: boolean;
};

export function Flowchart({ explanation, active, onAsk, embedded = false }: Props) {
  const { before, after } = explanation.flow;
  const changed = useMemo(() => changedNodeIds(before, after), [before, after]);
  const headingId = useId();
  // A branching graph is too wide for half a column: stack Before over After.
  const branches = [before, after].some((g) => g && hasBranch(g));

  return (
    <section
      aria-labelledby={headingId}
      className={cn(!embedded && "rounded-md bg-surface-1 p-6 shadow-elev-1")}
    >
      <h2 id={headingId} className="sr-only">
        How it works, before and after
      </h2>
      <div className={cn("grid gap-6", before && !branches && "min-[480px]:grid-cols-2 min-[480px]:gap-4")}>
        {before && (
          <Panel
            panel="before"
            title="Before"
            graph={before}
            levels={explanation.levels}
            active={active}
            changed={changed}
            onAsk={onAsk}
          />
        )}
        <Panel
          panel="after"
          title="After"
          isNew={!before}
          graph={after}
          levels={explanation.levels}
          active={active}
          changed={changed}
          onAsk={onAsk}
        />
      </div>
      <p className="mt-6 t-small text-fg-3">Select a box to ask why it works that way.</p>
    </section>
  );
}

type PanelProps = {
  panel: "before" | "after";
  title: string;
  isNew?: boolean;
  graph: FlowGraph;
  levels: Record<LevelKey, LevelText>;
  active: number;
  changed: Set<string>;
  onAsk: (target: AskTarget) => void;
};

function Panel({ panel, title, isNew, graph, levels, active, changed, onAsk }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"rendering" | "ready" | "failed">("rendering");
  const renderId = `flow${useId().replace(/[^a-zA-Z0-9]/g, "")}${panel}`;

  // Only the labels matter for drawing; summary edits shouldn't re-render.
  const labelsKey = JSON.stringify(LEVELS.map((l) => levels[l.key].labels));
  const levelsRef = useRef(levels);
  levelsRef.current = levels;

  useEffect(() => {
    let cancelled = false;
    setStatus("rendering");
    (async () => {
      try {
        const { mermaid, font } = await loadMermaid();
        await document.fonts?.ready;
        const sizing = widestLabels(graph, levelsRef.current, font);
        const { svg } = await mermaid.render(renderId, toMermaid(graph, sizing, changed));
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        if (!decorate(ref.current, graph, levelsRef.current)) throw new Error("Unexpected Mermaid output");
        setStatus("ready");
      } catch {
        document.getElementById(`d${renderId}`)?.remove();
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [graph, changed, labelsKey, renderId]);

  // Level change: crossfade labels in place. Boxes and arrows never move.
  useEffect(() => {
    if (status !== "ready" || !ref.current) return;
    const level = LEVELS[active].key;
    ref.current.querySelectorAll<SVGGElement>("g[data-ask]").forEach((g) => {
      g.querySelectorAll<HTMLElement>("[data-level]").forEach((span) => {
        span.dataset.active = String(Number(span.dataset.level) === active);
      });
      const key = g.dataset.key!;
      g.setAttribute("aria-label", `Ask why: ${levelsRef.current[level].labels[key] ?? key}`);
    });
  }, [active, status]);

  const fromEvent = (target: EventTarget) => {
    const g = (target as Element).closest<SVGGElement>("g[data-ask]");
    if (g) onAsk({ nodeId: g.dataset.ask!, key: g.dataset.key!, panel });
  };
  const onClick = (e: MouseEvent) => fromEvent(e.target);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fromEvent(e.target);
  };

  const level = LEVELS[active].key;
  const label = (key: string) => levels[level].labels[key] ?? key;
  const steps = orderedNodes(graph);

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="t-heading text-fg-1">{title}</h3>
        {isNew && (
          <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 t-micro text-fg-2">New</span>
        )}
      </div>

      <div
        ref={ref}
        data-panel={panel}
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-hidden={status !== "ready" || undefined}
        className={cn(
          "flow min-h-24 transition-opacity duration-200",
          status === "ready" ? "opacity-100" : "opacity-0",
          status === "failed" && "hidden",
        )}
      />

      {/* Text alternative; shown as the fallback when the chart can't render. */}
      <ol className={cn(status === "failed" ? "grid gap-2" : "sr-only")} aria-label={`${title}, step by step`}>
        {steps.map((node) => {
          const next = nextNodes(graph, node.id);
          if (status !== "failed") {
            return (
              <li key={node.id}>
                {label(node.key)}
                {next.length > 0 && `, then ${next.map((n) => label(n.key)).join(" or ")}`}
              </li>
            );
          }
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onAsk({ nodeId: node.id, key: node.key, panel })}
                className={cn(
                  "press w-full rounded-sm bg-surface-2 px-3 py-2 text-left t-small shadow-ring-strong",
                  panel === "after" ? "text-fg-1" : "text-fg-2",
                  changed.has(node.id) && "shadow-[0_0_0_2px_var(--color-steel)]",
                )}
              >
                {label(node.key)}
                {next.length > 0 && (
                  <span className="text-fg-3">, then {next.map((n) => label(n.key)).join(" or ")}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function hasBranch(graph: FlowGraph) {
  const out = new Map<string, number>();
  for (const [from] of graph.edges) out.set(from, (out.get(from) ?? 0) + 1);
  return [...out.values()].some((n) => n > 1);
}

/** Makes each node a button and stacks its six labels for crossfading. */
function decorate(root: HTMLElement, graph: FlowGraph, levels: Record<LevelKey, LevelText>) {
  const groups = root.querySelectorAll<SVGGElement>("g.node");
  let found = 0;
  groups.forEach((g) => {
    const id = g.dataset.id ?? g.id.match(/flowchart-(.+)-\d+$/)?.[1];
    const node = graph.nodes.find((n) => n.id === id);
    const labelEl = g.querySelector(".nodeLabel");
    if (!node || !labelEl) return;
    found++;

    g.dataset.ask = node.id;
    g.dataset.key = node.key;
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");

    const stack = document.createElement("span");
    stack.className = "swap swap-inline";
    LEVELS.forEach((level, i) => {
      const span = document.createElement("span");
      span.dataset.level = String(i);
      span.dataset.active = "false";
      span.textContent = levels[level.key].labels[node.key] ?? node.key;
      stack.append(span);
    });
    labelEl.replaceChildren(stack);
  });
  return found === graph.nodes.length;
}
