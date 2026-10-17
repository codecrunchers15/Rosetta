import { applyEdits } from "../edits";
import { parseGitHubLink } from "../github-url";
import { isTechnicalLevel, type LevelKey } from "../levels";
import type {
  AskResult,
  Card,
  CardEdits,
  ExplainEvent,
  ReplyResult,
  SentQuestion,
} from "../types";
import { firstName } from "../utils";
import { sampleByCardId, sampleByLink, type Sample } from "./samples";

/**
 * In-browser stand-in for the Next.js API routes, used while
 * NEXT_PUBLIC_API_BASE is unset. State lives in localStorage so drafts,
 * approvals and questions survive a reload.
 */

export class MockError extends Error {
  constructor(public code: "sample_only" | "not_found") {
    super(code);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type StoredCard = Pick<Card, "status" | "approvedBy" | "committedAt"> & { edits: CardEdits };
type StoredQuestion = {
  cardId: string;
  nodeKey: string;
  level: LevelKey;
  question: string;
  createdAt: number;
};

const read = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state lasts for this page only */
  }
};

const cardKey = (id: string) => `rosetta:card:${id}`;
const questionKey = (id: string) => `rosetta:question:${id}`;

const freshState = (): StoredCard => ({
  status: "draft",
  committedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  edits: {},
});

function buildCard(sample: Sample, state: StoredCard): Card {
  return {
    ...sample.card,
    status: state.status,
    approvedBy: state.approvedBy,
    committedAt: state.committedAt,
    explanation: applyEdits(sample.card.explanation, state.edits),
  };
}

export async function mockExplain(url: string, onEvent: (event: ExplainEvent) => void) {
  const link = parseGitHubLink(url);
  const ref = link?.kind === "commit" ? link.sha : "";
  const sample = link && sampleByLink(link.owner, link.repo, ref);
  await wait(250);
  if (!sample) throw new MockError("sample_only");

  onEvent({ type: "start", title: sample.reading });
  for (const text of sample.findings) {
    await wait(420);
    onEvent({ type: "finding", text });
  }
  await wait(380);
  onEvent({ type: "writing" });
  await wait(1500);

  const state = freshState();
  write(cardKey(sample.card.id), state);
  return buildCard(sample, state);
}

export async function mockGetCard(id: string) {
  const sample = sampleByCardId(id);
  if (!sample) throw new MockError("not_found");
  await wait(120);
  return buildCard(sample, read<StoredCard>(cardKey(id)) ?? freshState());
}

export async function mockApprove(id: string, edits: CardEdits) {
  const sample = sampleByCardId(id);
  if (!sample) throw new MockError("not_found");
  await wait(500);
  const state: StoredCard = {
    ...(read<StoredCard>(cardKey(id)) ?? freshState()),
    status: "approved",
    approvedBy: sample.card.author.name,
    edits,
  };
  write(cardKey(id), state);
  return buildCard(sample, state);
}

/** Questions about timing and plans can't be answered from a diff. */
const NEEDS_ENGINEER =
  /\b(delay|launch|deadline|timeline|when|date|ship|release|eta|schedule|cost|budget|ready)\b/i;

export async function mockAsk(input: {
  cardId: string;
  nodeKey: string;
  level: LevelKey;
  question: string;
}): Promise<AskResult> {
  const sample = sampleByCardId(input.cardId);
  if (!sample) throw new MockError("not_found");
  await wait(900);

  const step = sample.card.explanation.levels.engineer.labels[input.nodeKey] ?? input.nodeKey;
  if (NEEDS_ENGINEER.test(input.question)) {
    return {
      answerable: false,
      technicalQuestion: `A reader asked about the "${step}" step: "${input.question.trim()}" Does this change affect the release timeline, and is any follow-up needed (load testing, config rollout, monitoring) before it ships?`,
    };
  }

  const note = sample.notes[input.nodeKey];
  const answer = note
    ? isTechnicalLevel(input.level)
      ? note.tech
      : note.plain
    : sample.card.explanation.levels[input.level].summary;
  return { answerable: true, answer };
}

export async function mockSendToEngineer(input: {
  cardId: string;
  nodeKey: string;
  level: LevelKey;
  question: string;
}): Promise<SentQuestion> {
  const sample = sampleByCardId(input.cardId);
  if (!sample) throw new MockError("not_found");
  await wait(700);
  const questionId = `q_${Date.now().toString(36)}`;
  write(questionKey(questionId), { ...input, createdAt: Date.now() } satisfies StoredQuestion);
  return { questionId, commentUrl: `${sample.card.url}#commitcomment-${Date.now() % 1e8}` };
}

const REPLY =
  "No impact on the release. It's a self-contained change, it passed review, and I load-tested it locally at 3x normal traffic. Safe to ship with this week's release.";

const TRANSLATED: Record<LevelKey, (name: string) => string> = {
  engineer: () => REPLY,
  senior: () => REPLY,
  intern: (name) =>
    `${name} says this won't affect the release: the change is self-contained, reviewed, and was tested under 3 times the usual traffic.`,
  manager: (name) =>
    `This won't delay the launch. ${name} tested it under heavy traffic and it's ready for this week's release.`,
  client: (name) =>
    `This doesn't change your launch date. ${name} has tested the work and it goes out this week.`,
  mom: (name) => `${name} says don't worry, it won't make anything late. It's ready to go out this week.`,
};

export async function mockReply(questionId: string): Promise<ReplyResult> {
  const question = read<StoredQuestion>(questionKey(questionId));
  if (!question) throw new MockError("not_found");
  await wait(200);
  // A teammate "replies" about 12 seconds after the comment is posted.
  if (Date.now() - question.createdAt < 12_000) return { status: "waiting" };
  const sample = sampleByCardId(question.cardId);
  const name = firstName(sample?.card.author.name ?? "The engineer");
  return { status: "answered", reply: REPLY, translatedReply: TRANSLATED[question.level](name) };
}
