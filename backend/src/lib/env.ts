/** All configuration in one place. Everything is optional in development. */
export const env = {
  githubToken: process.env.GITHUB_TOKEN || "",

  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",

  /** Any OpenAI-compatible endpoint: Groq by default, or OpenRouter. */
  fallbackKey: process.env.FALLBACK_API_KEY || "",
  fallbackBaseUrl: process.env.FALLBACK_BASE_URL || "https://api.groq.com/openai/v1",
  fallbackModel: process.env.FALLBACK_MODEL || "llama-3.3-70b-versatile",

  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\n/g, "\n"),

  sessionSecret: process.env.SESSION_SECRET || "",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  /** Diffs above this many changed lines are trimmed (FR-1.4). */
  maxDiffLines: Number(process.env.MAX_DIFF_LINES || 400),
};

export const isProduction = process.env.NODE_ENV === "production";
