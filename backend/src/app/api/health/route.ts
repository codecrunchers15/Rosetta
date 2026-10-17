import { env } from "@/lib/env";
import { json, preflight, route } from "@/lib/http";
import { mailConfigured } from "@/lib/mail";
import { storeKind } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/health: what's configured, without revealing any keys. */
export const GET = route(async () =>
  json({
    ok: true,
    store: storeKind,
    github: Boolean(env.githubToken),
    gemini: Boolean(env.geminiKey),
    fallback: Boolean(env.fallbackKey),
    email: mailConfigured(),
  }),
);
