import { z } from "zod";
import { LEVELS, type LevelKey } from "../levels";
import type { Explanation, FlowGraph, LevelText } from "../types";

/**
 * The model can't return maps with arbitrary keys under a Gemini schema, so
 * labels come back as [{ key, text }] and edges as { from, to }. We convert
 * to the app's Explanation shape and repair small mistakes here.
 */

const S = (description?: string) => ({ type: "STRING", ...(description ? { description } : {}) });

const graphSchema = {
  type: "OBJECT",
  properties: {
    nodes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: S("Short unique id, e.g. b1 or a2"), key: S("snake_case step name, shared across levels") },
        required: ["id", "key"],
      },
    },
    edges: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { from: S(), to: S() }, required: ["from", "to"] },
    },
  },
  required: ["nodes", "edges"],
};

const levelSchema = {
  type: "OBJECT",
  properties: {
    summary: S("One sentence."),
    analogy: S("One sentence, an everyday comparison."),
    impact: S("One or two sentences on what changes for this reader."),
    labels: {
      type: "ARRAY",
      description: "One label for every node key used in the flow, at most 5 words.",
      items: { type: "OBJECT", properties: { key: S(), text: S() }, required: ["key", "text"] },
    },
  },
  required: ["summary", "analogy", "impact", "labels"],
};

export const explanationSchema = {
  type: "OBJECT",
  properties: {
    title: S("Plain-language title, at most 7 words, sentence case."),
    risk: { type: "STRING", enum: ["low", "medium", "high"] },
    riskReason: S("One short sentence on why this risk level."),
    flow: {
      type: "OBJECT",
      properties: {
        before: { ...graphSchema, nullable: true, description: "null when there was no meaningful before state" },
        after: graphSchema,
      },
      required: ["after"],
    },
    levels: {
      type: "OBJECT",
      properties: Object.fromEntries(LEVELS.map((l) => [l.key, levelSchema])),
      required: LEVELS.map((l) => l.key),
    },
  },
  required: ["title", "risk", "riskReason", "flow", "levels"],
};

const rawGraph = z.object({
  nodes: z.array(z.object({ id: z.string().min(1), key: z.string().min(1) })),
  edges: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
});

const rawLevel = z.object({
  summary: z.string().min(1),
  analogy: z.string().min(1),
  impact: z.string().min(1),
  labels: z.array(z.object({ key: z.string(), text: z.string() })).default([]),
});

const rawExplanation = z.object({
  title: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]).catch("medium"),
  riskReason: z.string().optional(),
  flow: z.object({ before: rawGraph.nullable().optional(), after: rawGraph }),
  levels: z.object(Object.fromEntries(LEVELS.map((l) => [l.key, rawLevel])) as Record<LevelKey, typeof rawLevel>),
});

const keyOf = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "step";

function cleanGraph(raw: z.infer<typeof rawGraph>, prefix: string): FlowGraph {
  const seen = new Set<string>();
  const idMap = new Map<string, string>();
  const nodes = raw.nodes.slice(0, 8).flatMap((node, i) => {
    let id = node.id.replace(/[^A-Za-z0-9_]/g, "") || `${prefix}${i + 1}`;
    if (!/^[A-Za-z]/.test(id)) id = `${prefix}${id}`;
    if (seen.has(id)) id = `${prefix}${i + 1}x`;
    seen.add(id);
    idMap.set(node.id, id);
    return [{ id, key: keyOf(node.key) }];
  });
  const edges = raw.edges
    .map((e) => [idMap.get(e.from), idMap.get(e.to)] as const)
    .filter((e): e is [string, string] => Boolean(e[0] && e[1]) && e[0] !== e[1]);
  return { nodes, edges: [...new Map(edges.map((e) => [e.join(">"), e])).values()] };
}

const humanize = (key: string) => {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function parseExplanation(raw: unknown): Omit<Explanation, "files"> {
  const data = rawExplanation.parse(raw);
  const before = data.flow.before?.nodes.length ? cleanGraph(data.flow.before, "b") : null;
  const after = cleanGraph(data.flow.after, "a");
  if (!after.nodes.length) throw new Error("Flow has no after nodes");

  // Ids must not collide across panels.
  if (before) {
    const afterIds = new Set(after.nodes.map((n) => n.id));
    if (before.nodes.some((n) => afterIds.has(n.id))) {
      const rename = new Map(before.nodes.map((n, i) => [n.id, `b${i + 1}`]));
      before.nodes = before.nodes.map((n) => ({ ...n, id: rename.get(n.id)! }));
      before.edges = before.edges.map(([a, b]) => [rename.get(a)!, rename.get(b)!]);
    }
  }

  const keys = [...new Set([...(before?.nodes ?? []), ...after.nodes].map((n) => n.key))];
  const given = Object.fromEntries(
    LEVELS.map(({ key }) => [key, new Map(data.levels[key].labels.map((l) => [keyOf(l.key), l.text.trim()]))]),
  ) as Record<LevelKey, Map<string, string>>;
  // A missing label borrows from the nearest level, so "My mom" never gets the engineer's words.
  const labelFor = (index: number, nodeKey: string) => {
    const order = LEVELS.map((_, j) => j).sort((a, b) => Math.abs(a - index) - Math.abs(b - index) || b - a);
    for (const j of order) {
      const text = given[LEVELS[j].key].get(nodeKey);
      if (text) return text;
    }
    return humanize(nodeKey);
  };

  const levels = Object.fromEntries(
    LEVELS.map(({ key }, index) => {
      const level = data.levels[key];
      const labels = Object.fromEntries(keys.map((k) => [k, labelFor(index, k)]));
      const text: LevelText = {
        summary: level.summary.trim(),
        analogy: level.analogy.trim(),
        impact: level.impact.trim(),
        labels,
      };
      return [key, text];
    }),
  ) as Record<LevelKey, LevelText>;

  return {
    title: data.title.trim().replace(/\.$/, ""),
    risk: data.risk,
    riskReason: data.riskReason?.trim(),
    flow: { before, after },
    levels,
  };
}

/** The app shape → the model's shape, for few-shot examples. */
export function toModelShape(explanation: Explanation) {
  const graph = (g: FlowGraph) => ({ nodes: g.nodes, edges: g.edges.map(([from, to]) => ({ from, to })) });
  return {
    title: explanation.title,
    risk: explanation.risk,
    riskReason: explanation.riskReason,
    flow: { before: explanation.flow.before ? graph(explanation.flow.before) : null, after: graph(explanation.flow.after) },
    levels: Object.fromEntries(
      LEVELS.map(({ key }) => {
        const l = explanation.levels[key];
        return [
          key,
          {
            summary: l.summary,
            analogy: l.analogy,
            impact: l.impact,
            labels: Object.entries(l.labels).map(([k, text]) => ({ key: k, text })),
          },
        ];
      }),
    ),
  };
}

/* Smaller tasks */

export const askSchema = {
  type: "OBJECT",
  properties: {
    answerable: { type: "BOOLEAN" },
    answer: S("The answer at the reader's level, empty when not answerable."),
    technical_question: S("The question rewritten for the engineer, empty when answerable."),
  },
  required: ["answerable", "answer", "technical_question"],
};

export const parseAsk = (raw: unknown) => {
  const r = z.object({ answerable: z.boolean(), answer: z.string(), technical_question: z.string() }).parse(raw);
  if (r.answerable && !r.answer.trim()) throw new Error("Empty answer");
  if (!r.answerable && !r.technical_question.trim()) throw new Error("Empty technical question");
  return r;
};

export const textSchema = { type: "OBJECT", properties: { text: S() }, required: ["text"] };
export const parseText = (raw: unknown) => {
  const { text } = z.object({ text: z.string().min(1) }).parse(raw);
  return text.trim();
};
