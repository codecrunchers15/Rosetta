import { LEVELS, type LevelKey } from "./levels";
import type { FlowGraph, LevelText } from "./types";

/** After-nodes whose step didn't exist before: drawn with a 2px Steel border. */
export function changedNodeIds(before: FlowGraph | null, after: FlowGraph) {
  if (!before) return new Set<string>();
  const beforeKeys = new Set(before.nodes.map((n) => n.key));
  return new Set(after.nodes.filter((n) => !beforeKeys.has(n.key)).map((n) => n.id));
}

const escapeLabel = (text: string) =>
  text.replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/`/g, "'");

/**
 * Our JSON → Mermaid text. The model never writes Mermaid (FR-3.2); labels
 * here only size the boxes, the real per-level labels are injected later.
 */
export function toMermaid(graph: FlowGraph, sizingLabels: Record<string, string>, changed: Set<string>) {
  const lines = ["flowchart TD"];
  for (const node of graph.nodes) {
    lines.push(`  ${node.id}["${escapeLabel(sizingLabels[node.key] ?? node.key)}"]`);
  }
  for (const [from, to] of graph.edges) lines.push(`  ${from} --> ${to}`);
  const changedIds = graph.nodes.filter((n) => changed.has(n.id)).map((n) => n.id);
  if (changedIds.length) lines.push(`  class ${changedIds.join(",")} changed`);
  return lines.join("\n");
}

/** For each node key, the label that renders widest across all levels. */
export function widestLabels(graph: FlowGraph, levels: Record<LevelKey, LevelText>, font: string) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (ctx) ctx.font = `14px ${font}`;
  const width = (text: string) => (ctx ? ctx.measureText(text).width : text.length);

  const result: Record<string, string> = {};
  for (const { key } of graph.nodes) {
    let best = key;
    for (const level of LEVELS) {
      const label = levels[level.key].labels[key] ?? key;
      if (width(label) > width(best) || best === key) best = label;
    }
    result[key] = best;
  }
  return result;
}

/** Nodes in reading order (breadth-first from the roots), for the step list. */
export function orderedNodes(graph: FlowGraph) {
  const incoming = new Set(graph.edges.map(([, to]) => to));
  const queue = graph.nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
  if (!queue.length && graph.nodes[0]) queue.push(graph.nodes[0].id);
  const seen = new Set<string>();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const [from, to] of graph.edges) if (from === id && !seen.has(to)) queue.push(to);
  }
  for (const n of graph.nodes) if (!seen.has(n.id)) order.push(n.id);
  return order.map((id) => graph.nodes.find((n) => n.id === id)!);
}

export const nextNodes = (graph: FlowGraph, id: string) =>
  graph.edges.filter(([from]) => from === id).map(([, to]) => graph.nodes.find((n) => n.id === to)!);
