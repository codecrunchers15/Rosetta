import type { LevelKey } from "./levels";
import {
  MockError,
  mockApprove,
  mockAsk,
  mockExplain,
  mockGetCard,
  mockReply,
  mockSendToEngineer,
} from "./mock/server";
import type {
  ApiErrorCode,
  AskResult,
  Card,
  CardEdits,
  ExplainEvent,
  ReplyResult,
  SentQuestion,
} from "./types";

/**
 * Client for the four Next.js API routes in the PRD (/api/explain,
 * /api/approve, /api/ask, /api/reply) plus GET /api/cards/:id for the share
 * page. With NEXT_PUBLIC_API_BASE unset, everything runs on sample data.
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "");
export const USING_SAMPLE_DATA = !BASE;

export class ApiError extends Error {
  constructor(public code: ApiErrorCode) {
    super(code);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new ApiError(await errorCode(res));
  return res.json() as Promise<T>;
}

async function errorCode(res: Response): Promise<ApiErrorCode> {
  const body = (await res.json().catch(() => null)) as { code?: ApiErrorCode } | null;
  if (body?.code) return body.code;
  if (res.status === 400) return "invalid_url";
  if (res.status === 403) return "private";
  if (res.status === 404) return "not_found";
  return "unavailable";
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MockError) throw new ApiError(error.code);
    throw error;
  }
}

/**
 * POST /api/explain { url }
 * Responds with the card as JSON, or as NDJSON lines of ExplainEvent followed
 * by { "type": "card", "card": … } so the loading screen can narrate.
 */
export async function explain(url: string, onEvent: (event: ExplainEvent) => void): Promise<Card> {
  if (!BASE) return guard(() => mockExplain(url, onEvent));

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new ApiError(await errorCode(res));

  if (!res.headers.get("content-type")?.includes("ndjson") || !res.body) {
    return res.json() as Promise<Card>;
  }

  type Line = ExplainEvent | { type: "card"; card: Card } | { type: "error"; code: ApiErrorCode };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const line = JSON.parse(raw) as Line;
      if (line.type === "card") return line.card;
      if (line.type === "error") throw new ApiError(line.code);
      onEvent(line);
    }
    if (done) throw new ApiError("unavailable");
  }
}

/** GET /api/cards/:id */
export function getCard(id: string): Promise<Card> {
  if (!BASE) return guard(() => mockGetCard(id));
  return call<Card>(`/api/cards/${encodeURIComponent(id)}`);
}

/** POST /api/approve { cardId, edits } */
export async function approve(cardId: string, edits: CardEdits): Promise<{ card: Card; shareUrl: string }> {
  const card = BASE
    ? (await call<{ card: Card }>("/api/approve", { method: "POST", body: JSON.stringify({ cardId, edits }) }))
        .card
    : await guard(() => mockApprove(cardId, edits));
  return { card, shareUrl: `${window.location.origin}/c/${card.id}` };
}

type AskInput = { cardId: string; nodeId: string; nodeKey: string; level: LevelKey; question: string };

/** POST /api/ask: answer from the diff, or return a technical rewrite for approval (FR-4.2, 4.3). */
export function ask(input: AskInput): Promise<AskResult> {
  if (!BASE) return guard(() => mockAsk(input));
  return call<AskResult>("/api/ask", { method: "POST", body: JSON.stringify(input) });
}

/** POST /api/ask { send: true }: posts the approved question as a [Rosetta] comment. */
export function sendToEngineer(input: AskInput & { technicalQuestion: string }): Promise<SentQuestion> {
  if (!BASE) return guard(() => mockSendToEngineer(input));
  return call<SentQuestion>("/api/ask", { method: "POST", body: JSON.stringify({ ...input, send: true }) });
}

/** GET /api/reply?questionId= (polled every 15 s, FR-4.4). */
export function getReply(questionId: string): Promise<ReplyResult> {
  if (!BASE) return guard(() => mockReply(questionId));
  return call<ReplyResult>(`/api/reply?questionId=${encodeURIComponent(questionId)}`);
}
