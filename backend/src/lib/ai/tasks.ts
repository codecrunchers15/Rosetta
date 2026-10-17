import { SAMPLES } from "../demo/samples";
import { LEVELS, type LevelKey } from "../levels";
import type { Explanation, User } from "../types";
import { generateJson } from "./provider";
import {
  askSchema,
  explanationSchema,
  levelsTextSchema,
  parseAsk,
  parseExplanation,
  parseLevelsText,
  parseText,
  textSchema,
  toModelShape,
} from "./schema";

const LEVEL_GUIDE: Record<LevelKey, string> = {
  engineer: "Engineer: precise, names functions, files, values and edge cases. Technical terms welcome.",
  senior: "Senior dev: a quick technical summary for a reviewer; patterns and risks, no hand-holding.",
  intern: "Intern: explains how and why, points to the file or function worth reading. Light jargon, defined.",
  manager: "Manager: impact, risk and whether plans change. No code names.",
  client: "Client: what their money paid for, in business terms. No technical words.",
  cmo: "CMO: a chief marketing officer who does not read code. Zero technical words; talk about customers, campaigns, brand and growth. If a word would need explaining, rewrite the sentence.",
};

const levelGuide = LEVELS.map((l) => `- ${LEVEL_GUIDE[l.key]}`).join("\n");

const EXPLAIN_SYSTEM = `You are a senior engineer who is also a great teacher. You explain one code change to six readers at once.

Readers (each gets a summary, analogy, impact, flowchart labels and a worked example):
${levelGuide}

The flowchart must actually explain how the change works, not just name it:
1. "after" shows the real mechanism in 5 to 10 nodes: where it starts, each meaningful step, every decision (kind "decision", with labelled yes/no or case edges), stored data (kind "data"), and every distinct outcome (kind "end"). Show each branch separately, e.g. one node per server, per retry outcome, per cache hit or miss.
2. Use a group to box the parts this change added or the things that belong together (a server pool, a new module).
3. "before" shows how it worked previously, in 2 to 6 nodes, with the same node keys for steps that didn't change. null when there was no meaningful before state.
4. "walkthrough" traces 3 or 4 concrete examples through the after graph (path = the node ids visited, in order, loops allowed). Use specific values: request numbers, timings, ids, amounts. Each level tells every step in one sentence in its own words.
5. The structure is identical for every reader; only the text changes. Every node key, group key and edge label key needs a label at every level (at most 6 words).

Rules:
- Never invent behaviour that is not in the diff or commit message. If something is unclear, say less.
- Analogies come from everyday Indian life: queues, kitchens, traffic, shops, trains, festivals, chai.
- Risk: "high" if it touches auth, payments, database migrations or deletes data; "medium" for shared logic; "low" otherwise. Give the reason in one short sentence.
- Sentence case. No exclamation marks. No words like "seamless", "magic" or "AI-powered". Numbers as digits.`;

const example = JSON.stringify(toModelShape(SAMPLES[0].card.explanation));

export async function explainChange(input: {
  repo: string;
  message: string;
  files: string[];
  diff: string;
  truncated: boolean;
}): Promise<Omit<Explanation, "files">> {
  const prompt = `An example of the expected depth and shape (a round-robin load balancer):

${example}

Now explain this change.

Repository: ${input.repo}
Commit message:
${input.message}

Changed files${input.truncated ? " (trimmed to the most changed ones)" : ""}: ${input.files.join(", ")}

Diff:
${input.diff}`;

  return generateJson({ name: "explain", system: EXPLAIN_SYSTEM, prompt, schema: explanationSchema, parse: parseExplanation });
}

export async function answerQuestion(input: {
  explanation: Explanation;
  level: LevelKey;
  nodeKey: string;
  question: string;
  diff: string;
}) {
  const { explanation, level, nodeKey } = input;
  const system = `You answer a reader's question about one code change, using only the diff and the explanation.
The reader is at this level: ${LEVEL_GUIDE[level]}

Set answerable to true only if the diff or explanation actually answers it. Questions about timelines, launches, budgets, plans, people or intent are NOT answerable from code: set answerable to false.
When answerable: answer in at most 3 sentences at the reader's level.
When not answerable: write technical_question, the question rewritten for the engineer in 1 or 2 precise sentences that name the relevant file or function.`;

  const prompt = `Step the reader asked about: "${explanation.levels[level].labels[nodeKey] ?? nodeKey}" (technical name: "${explanation.levels.engineer.labels[nodeKey] ?? nodeKey}")
Reader's question: ${input.question}

Explanation for an engineer:
${JSON.stringify(explanation.levels.engineer)}

Diff:
${input.diff}`;

  return generateJson({ name: "ask", system, prompt, schema: askSchema, parse: parseAsk, temperature: 0.2 });
}

/**
 * One message (an engineer's comment, a reply to a question) rewritten for
 * all six readers in a single call, so every viewer reads it at their level.
 */
export async function translateForLevels(text: string, authorName: string, context?: string) {
  const system = `Rewrite a message written by ${authorName} for six readers. Keep every fact and add none. Refer to the author as ${authorName} where natural. At most 3 sentences each.
${levelGuide}
For the engineer level, return the original message unchanged.`;
  const prompt = `${context ? `Context: ${context}\n\n` : ""}Message:\n${text}`;
  return generateJson({
    name: "translate",
    system,
    prompt,
    schema: levelsTextSchema,
    parse: parseLevelsText,
    temperature: 0.2,
  });
}

const FOCUS_TEXT: Record<string, string> = {
  timelines: "timelines and launch dates",
  cost: "cost and value for money",
  risk: "risk and what could go wrong",
  "how-it-works": "understanding how it works",
  "user-impact": "what users and customers notice",
};

/** A short note addressed to one person, from their profile. */
export async function personalNote(explanation: Explanation, user: User) {
  const level = user.role;
  const cares = user.focus.map((f) => FOCUS_TEXT[f]).filter(Boolean).join(", ") || "the overall impact";
  const system = `Write 2 sentences addressed directly to one reader ("you") about what this code change means for them.
Reader: ${user.name}${user.title ? `, ${user.title}` : ""}. ${LEVEL_GUIDE[level]}
They care most about: ${cares}.
Use only facts from the explanation; never invent dates, numbers or plans.${
    user.language === "hinglish" ? " Write in simple Hinglish (Hindi words in Latin script mixed with English)." : ""
  } Return { "text": … }.`;
  const prompt = JSON.stringify({ title: explanation.title, risk: explanation.risk, ...explanation.levels[level] });
  return generateJson({ name: "personal-note", system, prompt, schema: textSchema, parse: parseText, temperature: 0.5 });
}
