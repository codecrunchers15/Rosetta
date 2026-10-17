import type { LevelKey } from "./levels";

export type Risk = "low" | "medium" | "high";

export type FlowNode = { id: string; key: string };
export type FlowGraph = { nodes: FlowNode[]; edges: [string, string][] };

export type LevelText = {
  summary: string;
  analogy: string;
  impact: string;
  /** Flowchart label for each node `key`. */
  labels: Record<string, string>;
};

/** The JSON Gemini returns for one commit (PRD, "Explain response schema"). */
export type Explanation = {
  title: string;
  risk: Risk;
  /** Shown in the risk badge tooltip, e.g. "Touches payment logic." */
  riskReason?: string;
  files: string[];
  flow: {
    /** null when the change has no meaningful before state (FR-3.4). */
    before: FlowGraph | null;
    after: FlowGraph;
  };
  levels: Record<LevelKey, LevelText>;
};

export type FileChange = {
  path: string;
  additions: number;
  deletions: number;
  url: string;
};

export type CardRef =
  | { kind: "commit"; sha: string }
  | { kind: "pull"; number: number };

/** A Firestore `cards` document plus the GitHub metadata the UI shows. */
export type Card = {
  id: string;
  repo: string;
  ref: CardRef;
  url: string;
  author: { name: string; login: string };
  committedAt: string;
  status: "draft" | "approved";
  approvedBy?: string;
  files: FileChange[];
  /** Set when the diff was trimmed to the most-changed files (FR-1.4). */
  truncated?: { shownFiles: number };
  explanation: Explanation;
};

export type EditableField = "summary" | "analogy" | "impact";

export type CardEdits = {
  title?: string;
  levels?: Partial<Record<LevelKey, Partial<Record<EditableField, string>>>>;
};

/** Streamed by /api/explain before the card is ready (FR-6.1). */
export type ExplainEvent =
  | { type: "start"; title: string }
  | { type: "finding"; text: string }
  | { type: "writing" };

export type AskResult =
  | { answerable: true; answer: string }
  | { answerable: false; technicalQuestion: string };

export type SentQuestion = { questionId: string; commentUrl?: string };

export type ReplyResult =
  | { status: "waiting" }
  | { status: "answered"; reply: string; translatedReply: string };

export type ApiErrorCode =
  | "invalid_url"
  | "private"
  | "not_found"
  | "unavailable"
  | "sample_only"
  | "network";

/* ------------------------------------------------------------------ */
/* Server-side additions                                               */
/* ------------------------------------------------------------------ */

export type Focus = "timelines" | "cost" | "risk" | "how-it-works" | "user-impact";

/** A reader or engineer profile (the "profile card" made at login). */
export type User = {
  id: string;
  email: string;
  name: string;
  /** Which Bridge Slider level fits this person by default. */
  role: LevelKey;
  /** Free text, e.g. "Product manager" or "Backend engineer". */
  title?: string;
  organization?: string;
  /** Lets an engineer approve cards for their own commits. */
  githubLogin?: string;
  /** What they care about; shapes the personal note. */
  focus: Focus[];
  language: "en" | "hinglish";
  createdAt: string;
  updatedAt: string;
};

/** What a card response tells the current viewer. */
export type Viewer = { canApprove: boolean; level: LevelKey | null };

/** A card as stored in Firestore. Diffs are never stored (PRD privacy). */
export type StoredCard = Card & {
  /** Head commit SHA, also for pull requests: used for comments and caching. */
  headSha: string;
  /** Loading-screen lines, replayed when the same commit is explained again. */
  reading: string;
  findings: string[];
  createdBy?: string;
  createdAt: string;
  approvedAt?: string;
};

export type StoredQuestion = {
  id: string;
  cardId: string;
  nodeId: string;
  nodeKey: string;
  level: LevelKey;
  question: string;
  technicalQuestion: string;
  askedBy?: { id: string; name: string };
  githubCommentId: number;
  commentUrl: string;
  commentCreatedAt: string;
  status: "waiting" | "answered";
  reply?: string;
  translatedReply?: string;
  lastCheckedAt?: string;
  createdAt: string;
};
