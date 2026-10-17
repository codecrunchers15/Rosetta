import { SAMPLES } from "../demo/samples";
import { LEVELS, type LevelKey } from "../levels";
import type { Explanation, User } from "../types";
import { generateJson } from "./provider";
import { askSchema, explanationSchema, parseAsk, parseExplanation, parseText, textSchema, toModelShape } from "./schema";

const LEVEL_GUIDE: Record<LevelKey, string> = {
  engineer: "Engineer: precise, names functions, files and edge cases. Technical terms welcome.",
  senior: "Senior dev: a quick technical summary for a reviewer; patterns and risks, no hand-holding.",
  intern: "Intern: explains how and why, points to the file or function worth reading. Light jargon, defined.",
  manager: "Manager: impact, risk and whether plans change. No code names.",
  client: "Client: what their money paid for, in business terms. No technical words.",
  mom: "My mom: someone who has never seen code. Zero technical words; if a word would need explaining, rewrite the sentence.",
};

const levelGuide = LEVELS.map((l) => `- ${LEVEL_GUIDE[l.key]}`).join("\n");

const EXPLAIN_SYSTEM = `You are a senior engineer who is also a great teacher. You explain one code change to six readers at once.

Readers (each gets summary, analogy, impact and flowchart labels):
${levelGuide}

Rules:
1. Never invent behaviour that is not in the diff or commit message. If something is unclear, say less.
2. The flowchart has the same structure for every reader: one "before" and one "after" graph of 2 to 6 steps. Only the labels change per level. Every node key needs a label at every level.
3. "before" is null when there was no meaningful before state (for example a brand-new file).
4. Analogies come from everyday Indian life: queues, kitchens, traffic, shops, trains, festivals, chai.
5. Risk: "high" if it touches auth, payments, database migrations or deletes data; "medium" for shared logic; "low" otherwise. Give the reason in one short sentence.
6. Sentence case. No exclamation marks. No words like "seamless", "magic" or "AI-powered". Numbers as digits.
7. Summary is one sentence. Labels are at most 5 words.`;

const examples = SAMPLES.slice(0, 2)
  .map(
    (s) =>
      `Example (${s.name}, files: ${s.card.explanation.files.join(", ")}):\n${JSON.stringify(toModelShape(s.card.explanation))}`,
  )
  .join("\n\n");

export async function explainChange(input: {
  repo: string;
  message: string;
  files: string[];
  diff: string;
  truncated: boolean;
}): Promise<Omit<Explanation, "files">> {
  const prompt = `Two examples of the expected tone and shape:

${examples}

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

  const prompt = `Step the reader clicked: "${explanation.levels[level].labels[nodeKey] ?? nodeKey}" (technical name: "${explanation.levels.engineer.labels[nodeKey] ?? nodeKey}")
Reader's question: ${input.question}

Explanation for an engineer:
${JSON.stringify(explanation.levels.engineer)}

Diff:
${input.diff}`;

  return generateJson({ name: "ask", system, prompt, schema: askSchema, parse: parseAsk, temperature: 0.2 });
}

export async function translateReply(reply: string, level: LevelKey, engineerName: string) {
  const system = `Rewrite an engineer's reply for a reader. ${LEVEL_GUIDE[level]}
Keep every fact, add none. Refer to the engineer as ${engineerName}. At most 3 sentences. Return { "text": … }.`;
  return generateJson({ name: "translate", system, prompt: reply, schema: textSchema, parse: parseText, temperature: 0.2 });
}

const FOCUS_TEXT: Record<string, string> = {
  timelines: "timelines and launch dates",
  cost: "cost and value for money",
  risk: "risk and what could go wrong",
  "how-it-works": "understanding how it works",
  "user-impact": "what users and customers notice",
};

/** A short note addressed to one person, from their profile card. */
export async function personalNote(explanation: Explanation, user: User) {
  const level = user.role;
  const cares = user.focus.map((f) => FOCUS_TEXT[f]).filter(Boolean).join(", ") || "the overall impact";
  const system = `Write 2 sentences addressed directly to one reader ("you") about what this code change means for them.
Reader: ${user.name}${user.title ? `, ${user.title}` : ""}${user.organization ? ` at ${user.organization}` : ""}. ${LEVEL_GUIDE[level]}
They care most about: ${cares}.
Use only facts from the explanation; never invent dates, numbers or plans.${
    user.language === "hinglish" ? " Write in simple Hinglish (Hindi words in Latin script mixed with English)." : ""
  } Return { "text": … }.`;
  const prompt = JSON.stringify({ title: explanation.title, risk: explanation.risk, ...explanation.levels[level] });
  return generateJson({ name: "personal-note", system, prompt, schema: textSchema, parse: parseText, temperature: 0.5 });
}
