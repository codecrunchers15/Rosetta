import { env } from "../env";
import { ApiError } from "../http";

/**
 * One interface over Gemini (primary) and any OpenAI-compatible model
 * (Groq or OpenRouter) as the fallback when Gemini is slow or rate-limited.
 */

export type JsonTask<T> = {
  name: string;
  system: string;
  prompt: string;
  /** Gemini responseSchema (OpenAPI subset). */
  schema: object;
  /** Parses and repairs the raw model output; throws if unusable. */
  parse: (raw: unknown) => T;
  temperature?: number;
  /** Tokens the model may spend thinking first. 0 = answer straight away (fastest). */
  thinkingBudget?: number;
  /** Per attempt. Big explanations need longer than quick rewrites. */
  timeoutMs?: number;
};

export const aiConfigured = () => Boolean(env.geminiKey || env.fallbackKey);

async function gemini(task: JsonTask<unknown>): Promise<unknown> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: task.system }] },
        contents: [{ role: "user", parts: [{ text: task.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: task.schema,
          temperature: task.temperature ?? 0.4,
          thinkingConfig: { thinkingBudget: task.thinkingBudget ?? 0 },
        },
      }),
      signal: AbortSignal.timeout(task.timeoutMs ?? 45_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  // Thinking models may return thought parts; only the answer parts are JSON.
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini returned no text");
  return JSON.parse(text);
}

async function openAiCompatible(task: JsonTask<unknown>): Promise<unknown> {
  const res = await fetch(`${env.fallbackBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.fallbackKey}` },
    body: JSON.stringify({
      model: env.fallbackModel,
      temperature: task.temperature ?? 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${task.system}\n\nRespond with one JSON object only, matching this schema:\n${JSON.stringify(task.schema)}`,
        },
        { role: "user", content: task.prompt },
      ],
    }),
    signal: AbortSignal.timeout(task.timeoutMs ?? 45_000),
  });
  if (!res.ok) throw new Error(`Fallback ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Fallback returned no text");
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

export async function generateJson<T>(task: JsonTask<T>): Promise<T> {
  const attempts: [string, () => Promise<unknown>][] = [];
  if (env.geminiKey) {
    attempts.push(["gemini", () => gemini(task)], ["gemini retry", () => gemini(task)]);
  }
  if (env.fallbackKey) attempts.push(["fallback", () => openAiCompatible(task)]);

  let skipRetry = false;
  for (const [label, run] of attempts) {
    // A timeout or an overloaded model won't recover in a second: go straight to the fallback.
    if (label === "gemini retry" && skipRetry) continue;
    try {
      return task.parse(await run());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|aborted| 503| 429/i.test(message)) skipRetry = true;
      console.warn(`[rosetta] ${task.name}: ${label} failed:`, message.slice(0, 200));
    }
  }
  throw new ApiError("unavailable");
}
