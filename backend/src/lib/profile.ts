import { z } from "zod";

/** The profile card collected at login. `role` is the reader's default slider level. */
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().trim().toLowerCase().max(200),
  role: z.enum(["engineer", "senior", "intern", "manager", "client", "mom"]),
  title: z.string().trim().max(80).optional(),
  organization: z.string().trim().max(80).optional(),
  githubLogin: z
    .union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9-]{1,39}$/, "Not a GitHub username")])
    .optional()
    .transform((v) => v || undefined),
  focus: z.array(z.enum(["timelines", "cost", "risk", "how-it-works", "user-impact"])).max(5).default([]),
  language: z.enum(["en", "hinglish"]).default("en"),
});
