import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env, isProduction } from "./env";
import { ApiError } from "./http";
import { store } from "./store";
import type { StoredUser, User } from "./types";

/**
 * Email + password accounts. Passwords are hashed with scrypt; sessions are
 * an HMAC-signed `{ sub, exp }` token sent as `Authorization: Bearer …`,
 * which works across the frontend and backend origins without cookie rules.
 */

const TTL_SECONDS = 30 * 24 * 3600;
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const globalSecret = globalThis as unknown as { __rosettaDevSecret?: string };
function secret() {
  if (env.sessionSecret) return env.sessionSecret;
  if (isProduction) throw new Error("SESSION_SECRET must be set in production.");
  return (globalSecret.__rosettaDevSecret ??= randomBytes(32).toString("hex"));
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export const userIdFor = (email: string) =>
  `u_${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16)}`;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function checkPassword(password: string, stored: string) {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

/** The user as sent to the browser: no password hash. */
export function publicUser(user: StoredUser | User): User {
  const { passwordHash: _hash, inviteCode: _code, ...rest } = user as StoredUser;
  return rest;
}

export function issueToken(userId: string) {
  const payload = b64(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

function verify(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub: string; exp: number };
    return exp > Date.now() / 1000 ? sub : null;
  } catch {
    return null;
  }
}

export async function optionalUser(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const id = token && verify(token);
  if (!id) return null;
  const user = await store.get<StoredUser>("users", id);
  return user ? publicUser(user) : null;
}

export async function requireUser(req: Request): Promise<User> {
  const user = await optionalUser(req);
  if (!user) throw new ApiError("unauthorized", "Log in to do this.");
  return user;
}
