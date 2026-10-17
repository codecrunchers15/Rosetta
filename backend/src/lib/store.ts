import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Document storage. Firestore when FIREBASE_* is set (PRD), otherwise a
 * JSON file in .data/ so the backend runs locally with no setup.
 * Every document has a known id, so get/set is all we need.
 */

export type Collection = "users" | "cards" | "questions" | "explanations" | "notes";

interface Store {
  get<T>(collection: Collection, id: string): Promise<T | null>;
  set<T extends object>(collection: Collection, id: string, data: T): Promise<void>;
}

class FirestoreStore implements Store {
  private db: Promise<import("firebase-admin/firestore").Firestore>;

  constructor() {
    this.db = (async () => {
      const { initializeApp, getApps, cert } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      const app =
        getApps()[0] ??
        initializeApp({
          credential: cert({
            projectId: env.firebaseProjectId,
            clientEmail: env.firebaseClientEmail,
            privateKey: env.firebasePrivateKey,
          }),
        });
      const db = getFirestore(app);
      db.settings({ ignoreUndefinedProperties: true });
      return db;
    })();
  }

  async get<T>(collection: Collection, id: string) {
    const snap = await (await this.db).collection(collection).doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async set<T extends object>(collection: Collection, id: string, data: T) {
    await (await this.db).collection(collection).doc(id).set(data);
  }
}

class FileStore implements Store {
  private file = path.join(process.cwd(), ".data", "store.json");
  private data: Record<string, Record<string, unknown>>;

  constructor() {
    this.data = existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : {};
  }

  async get<T>(collection: Collection, id: string) {
    const doc = this.data[collection]?.[id];
    return doc ? (structuredClone(doc) as T) : null;
  }

  async set<T extends object>(collection: Collection, id: string, data: T) {
    (this.data[collection] ??= {})[id] = JSON.parse(JSON.stringify(data));
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}

const usingFirestore = Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);

// One instance per server process, also across dev hot reloads.
const globalStore = globalThis as unknown as { __rosettaStore?: Store };
export const store: Store = (globalStore.__rosettaStore ??= usingFirestore ? new FirestoreStore() : new FileStore());
export const storeKind = usingFirestore ? "firestore" : "file";

export async function update<T extends object>(collection: Collection, id: string, patch: Partial<T>) {
  const current = await store.get<T>(collection, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await store.set(collection, id, next);
  return next;
}
