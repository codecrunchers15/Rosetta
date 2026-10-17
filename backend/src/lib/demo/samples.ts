import type { Card, Explanation, FileChange } from "../types";

/**
 * The three demo commits from the PRD. They back the sample chips, the home
 * mini demo, and the whole app while NEXT_PUBLIC_API_BASE is unset.
 */

export const DEMO_REPO = process.env.DEMO_REPO || "code-crunchers/rosetta-demo";

const AUTHOR = { name: "Arjun Mehta", login: "arjun-mehta" };

const file = (path: string, additions: number, deletions: number, sha: string): FileChange => ({
  path,
  additions,
  deletions,
  url: `https://github.com/${DEMO_REPO}/blob/${sha}/${path}`,
});

export type Sample = {
  key: "round-robin" | "caching" | "retry";
  /** Chip text, plain words (design.md §6). */
  name: string;
  /** Loading headline: "Reading {reading}…" */
  reading: string;
  sha: string;
  url: string;
  findings: string[];
  /** Ask Why answers per node key: technical readers and everyone else. */
  notes: Record<string, { tech: string; plain: string }>;
  card: Omit<Card, "committedAt" | "status" | "approvedBy">;
};

/* ------------------------------------------------------------------ */
/* Round-robin load balancer                                           */
/* ------------------------------------------------------------------ */

const rrSha = "a3f9c2e8d41b7f06c5e2a9d3b8f17c4e6a0d5b92";

const roundRobin: Explanation = {
  title: "Spread traffic across three servers",
  risk: "low",
  riskReason: "Only changes which server handles a request. No data or payments are touched.",
  files: ["src/balancer.js", "config/servers.json"],
  flow: {
    before: {
      nodes: [
        { id: "b1", key: "request" },
        { id: "b2", key: "server1" },
      ],
      edges: [["b1", "b2"]],
    },
    after: {
      nodes: [
        { id: "a1", key: "request" },
        { id: "a2", key: "picker" },
        { id: "a3", key: "pool" },
      ],
      edges: [
        ["a1", "a2"],
        ["a2", "a3"],
      ],
    },
  },
  levels: {
    engineer: {
      summary:
        "Adds pickNextServer(): requests now cycle through servers[] with a modulo counter instead of always hitting servers[0].",
      analogy: "A ring-buffer index over the upstream pool that wraps at servers.length.",
      impact:
        "Load spreads evenly across 3 upstreams. The counter is module-level state, so it resets on restart and isn't shared across processes. There are no health checks yet, so a dead server still gets its turn.",
      labels: {
        request: "Incoming request",
        server1: "servers[0]",
        picker: "pickNextServer()",
        pool: "servers[0..2]",
      },
    },
    senior: {
      summary: "Replaces the hard-coded upstream with a round-robin picker over a 3-server pool.",
      analogy: "The same behaviour as an Nginx upstream block with default round-robin.",
      impact:
        "Even distribution, no sticky sessions, no health checks. Fine for stateless endpoints; watch anything that relies on in-memory session state.",
      labels: {
        request: "HTTP request",
        server1: "Single upstream",
        picker: "Round-robin picker",
        pool: "3-node pool",
      },
    },
    intern: {
      summary:
        "Requests used to go to one server. Now a small function picks the next server in a list each time, so all three share the load.",
      analogy:
        "Like dealing cards around a table: each player gets one in turn, then it starts again from the first.",
      impact:
        "Read pickNextServer() in src/balancer.js. The % operator wraps the counter back to 0 after the last server. That one line is the whole idea.",
      labels: {
        request: "A request comes in",
        server1: "Always server 1",
        picker: "Pick the next server",
        pool: "Pool of 3 servers",
      },
    },
    manager: {
      summary: "Traffic is now shared by 3 servers instead of 1.",
      analogy: "Like a supermarket opening every billing counter instead of just one.",
      impact:
        "The site can handle sale-day spikes without slowing down. Users notice nothing, and no data or payments are affected.",
      labels: {
        request: "Customer visits",
        server1: "One server",
        picker: "Takes turns",
        pool: "3 servers",
      },
    },
    client: {
      summary:
        "Your website now runs on 3 machines sharing the work, so it stays fast when many people visit at once.",
      analogy: "Like a restaurant adding two more cooks for the dinner rush.",
      impact:
        "Your customers get the same site, but busy days like a sale are far less likely to slow it down or take it offline.",
      labels: {
        request: "Your customer visits",
        server1: "One machine",
        picker: "Shares the work",
        pool: "3 machines",
      },
    },
    mom: {
      summary:
        "Arjun made the website share its work between three computers, so it doesn't get tired when lots of people come.",
      analogy:
        "Like a shop opening all its billing counters during Diwali, so nobody waits in one long line.",
      impact: "People using the website won't see any difference. It just keeps working smoothly on busy days.",
      labels: {
        request: "Someone opens the site",
        server1: "One counter",
        picker: "Next in line",
        pool: "Three counters",
      },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Caching layer                                                       */
/* ------------------------------------------------------------------ */

const cacheSha = "7c1e4b90f2a65d38e1c7b04a9f6d2e85c3b17a40";

const caching: Explanation = {
  title: "Remember recent product lookups",
  risk: "low",
  riskReason: "Adds a read-only cache. Product data itself is never changed.",
  files: ["src/cache.js", "src/products.js"],
  flow: {
    before: {
      nodes: [
        { id: "b1", key: "lookup" },
        { id: "b2", key: "db" },
      ],
      edges: [["b1", "b2"]],
    },
    after: {
      nodes: [
        { id: "a1", key: "lookup" },
        { id: "a2", key: "check" },
        { id: "a3", key: "memory" },
        { id: "a4", key: "db" },
      ],
      edges: [
        ["a1", "a2"],
        ["a2", "a3"],
        ["a2", "a4"],
      ],
    },
  },
  levels: {
    engineer: {
      summary:
        "Wraps getProduct() in an in-memory Map cache with a 60s TTL; repeat reads skip the database query.",
      analogy: "A read-through cache: cache.get() first, fall back to db.query() and cache.set() on a miss.",
      impact:
        "Repeat product reads drop from a database round-trip to a Map lookup. Entries can be up to 60s stale, the cache is per-process, and nothing invalidates it when a product is updated.",
      labels: {
        lookup: "getProduct(id)",
        db: "db.query()",
        check: "cache.get(id)",
        memory: "Map hit, TTL 60s",
      },
    },
    senior: {
      summary: "Adds a 60-second read-through cache in front of product lookups.",
      analogy: "Memoization with expiry, like a CDN for one hot query.",
      impact:
        "A big win on popular products. Known gaps: no invalidation on write, an unbounded Map, and a separate cache per instance.",
      labels: {
        lookup: "Product read",
        db: "Database query",
        check: "Cache lookup",
        memory: "In-memory hit",
      },
    },
    intern: {
      summary:
        "Before, every product view asked the database. Now the app remembers products it fetched in the last minute and answers from memory.",
      analogy: "Like keeping today's class notes on your desk instead of walking to the library each time.",
      impact:
        "See src/cache.js: a Map stores each product with the time it was saved. If the entry is older than 60 seconds, the app asks the database again.",
      labels: {
        lookup: "Ask for a product",
        db: "Read the database",
        check: "Check memory first",
        memory: "Answer from memory",
      },
    },
    manager: {
      summary: "Product pages now load from memory when they were viewed in the last minute.",
      analogy: "Like a shopkeeper keeping bestsellers on the front shelf instead of fetching them from the godown.",
      impact:
        "Popular products open much faster and the database does less work. A price change can take up to a minute to show.",
      labels: {
        lookup: "Shopper opens product",
        db: "Fetch from storage",
        check: "Seen it recently?",
        memory: "Instant answer",
      },
    },
    client: {
      summary: "Your most-viewed products now appear almost instantly.",
      analogy: "Like a chaiwala keeping a pot ready for regulars instead of brewing each cup from scratch.",
      impact:
        "Shoppers wait less on popular items, which usually means fewer people leave. Price updates can take up to a minute to appear.",
      labels: {
        lookup: "Shopper views item",
        db: "Look it up",
        check: "Remembered?",
        memory: "Shown instantly",
      },
    },
    mom: {
      summary:
        "Arjun taught the website to remember things people looked at recently, so it can show them faster.",
      analogy: "Like keeping the sugar dabba next to the stove instead of in the top cupboard.",
      impact: "Things people look at often now open straight away. If a price changes, it takes about a minute to update.",
      labels: {
        lookup: "Someone looks at a saree",
        db: "Go to the storeroom",
        check: "Remember it?",
        memory: "Show it straight away",
      },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Retry with backoff                                                  */
/* ------------------------------------------------------------------ */

const retrySha = "e52d08a7b3c94f16d0e8a2b5c7f39d41a6e0b8c3";

const retry: Explanation = {
  title: "Retry payments that fail for a moment",
  risk: "medium",
  riskReason: "Touches payment logic. Retries are capped at 3 and only happen on network errors.",
  files: ["src/lib/retry.js", "src/payments/charge.js"],
  flow: {
    before: {
      nodes: [
        { id: "b1", key: "charge" },
        { id: "b2", key: "gateway" },
        { id: "b3", key: "error" },
      ],
      edges: [
        ["b1", "b2"],
        ["b2", "b3"],
      ],
    },
    after: {
      nodes: [
        { id: "a1", key: "charge" },
        { id: "a2", key: "gateway" },
        { id: "a3", key: "retry" },
        { id: "a4", key: "wait" },
        { id: "a5", key: "result" },
      ],
      edges: [
        ["a1", "a2"],
        ["a2", "a3"],
        ["a3", "a4"],
        ["a4", "a2"],
        ["a3", "a5"],
      ],
    },
  },
  levels: {
    engineer: {
      summary:
        "Wraps gateway.charge() in withRetry(): up to 3 attempts with exponential backoff (200, 400, 800ms) on network and 5xx errors only.",
      analogy: "Standard retry with backoff; card declines (4xx) short-circuit and are never retried.",
      impact:
        "Fewer failed charges from transient gateway errors. Double-charge safety depends on the idempotency key: this commit passes order.id as Idempotency-Key, which the gateway must honour.",
      labels: {
        charge: "chargeCard(order)",
        gateway: "gateway.charge()",
        error: "throw on failure",
        retry: "isRetryable(err)",
        wait: "backoff 200·2ⁿ ms",
        result: "resolve or throw",
      },
    },
    senior: {
      summary: "Adds capped exponential-backoff retries around payment charges.",
      analogy: "The same pattern as the AWS SDK retry policy, limited to retryable errors.",
      impact:
        "Recovers from flaky gateway calls. Review the idempotency key handling carefully; it is the only thing preventing duplicate charges.",
      labels: {
        charge: "Charge request",
        gateway: "Gateway call",
        error: "Fail immediately",
        retry: "Retryable error?",
        wait: "Exponential backoff",
        result: "Success or final error",
      },
    },
    intern: {
      summary:
        "When a payment request fails because of a network glitch, the code now waits a little and tries again, up to 3 times.",
      analogy: "Like redialling a friend when the call drops, waiting a bit longer before each try.",
      impact:
        "Read src/lib/retry.js. The wait doubles on each attempt so a struggling bank isn't flooded. Real declines, like a wrong card number, are not retried.",
      labels: {
        charge: "Start a payment",
        gateway: "Ask the bank",
        error: "Show the error",
        retry: "Network glitch?",
        wait: "Wait, then try again",
        result: "Done, or give up",
      },
    },
    manager: {
      summary: "Payments that fail because of a brief network problem now retry automatically, up to 3 times.",
      analogy: "Like a cashier re-swiping a card when the machine loses signal, instead of turning the customer away.",
      impact:
        "Fewer lost sales from temporary errors. Medium risk because it touches payments, so it is worth a careful review before release.",
      labels: {
        charge: "Customer pays",
        gateway: "Bank is contacted",
        error: "Payment fails",
        retry: "Temporary problem?",
        wait: "Wait and retry",
        result: "Paid, or a clear error",
      },
    },
    client: {
      summary: "Fewer of your customers' payments will fail because of a temporary glitch.",
      analogy: "Like a delivery partner ringing the bell again after a minute instead of leaving with the parcel.",
      impact:
        "More completed orders on busy or unstable days. The change is built so the same order is not charged twice.",
      labels: {
        charge: "Your customer pays",
        gateway: "Bank checks it",
        error: "Sale lost",
        retry: "Brief hiccup?",
        wait: "Try again shortly",
        result: "Sale completes",
      },
    },
    mom: {
      summary: "When a payment gets stuck for a moment, the website now quietly tries again instead of giving up.",
      analogy: "Like clicking the gas lighter a second time when it doesn't catch on the first try.",
      impact: "More people finish paying on the first go. Arjun made sure nobody pays twice for the same thing.",
      labels: {
        charge: "Someone pays",
        gateway: "Ask the bank",
        error: "It fails",
        retry: "Just a hiccup?",
        wait: "Wait a moment",
        result: "Payment goes through",
      },
    },
  },
};

/* ------------------------------------------------------------------ */

export const SAMPLES: Sample[] = [
  {
    key: "round-robin",
    name: "Round-robin",
    reading: "round-robin balancer",
    sha: rrSha,
    url: `https://github.com/${DEMO_REPO}/commit/${rrSha}`,
    findings: ["Found 2 changed files", "New function: `pickNextServer()`", "`servers` list now rotates"],
    notes: {
      request: {
        tech: "Requests enter through the same handler as before; only the upstream selection after it changed.",
        plain: "Nothing changes for the visitor. They arrive exactly the way they did before.",
      },
      server1: {
        tech: "Previously every request was proxied to servers[0], so the other two machines sat idle.",
        plain: "Before this change, every visitor was sent to the same single machine, even when it was busy.",
      },
      picker: {
        tech: "pickNextServer() increments a module-level counter modulo servers.length, so selection cycles 0, 1, 2, 0 and so on.",
        plain: "Each new visitor is sent to the next machine in line, then it starts again from the first. That is what spreads the work.",
      },
      pool: {
        tech: "config/servers.json now lists 3 upstreams. Adding a 4th is a config change; the picker adapts because it reads servers.length.",
        plain: "There are now three machines doing the work instead of one, and more can be added later without new code.",
      },
    },
    card: {
      id: "demo-round-robin",
      repo: DEMO_REPO,
      ref: { kind: "commit", sha: rrSha },
      url: `https://github.com/${DEMO_REPO}/commit/${rrSha}`,
      author: AUTHOR,
      files: [file("src/balancer.js", 18, 4, rrSha), file("config/servers.json", 5, 1, rrSha)],
      explanation: roundRobin,
    },
  },
  {
    key: "caching",
    name: "Caching",
    reading: "product caching",
    sha: cacheSha,
    url: `https://github.com/${DEMO_REPO}/commit/${cacheSha}`,
    findings: ["Found 2 changed files", "New file: `src/cache.js`", "`getProduct()` now checks memory first"],
    notes: {
      lookup: {
        tech: "getProduct(id) keeps its signature, so no callers had to change.",
        plain: "Opening a product works the same way it always did.",
      },
      db: {
        tech: "On a miss it still runs db.query(), then stores the row with cache.set(id, row).",
        plain: "If nobody looked at the product recently, it is fetched from storage like before, then remembered.",
      },
      check: {
        tech: "cache.get(id) returns the entry only if Date.now() - savedAt < 60_000; anything older is treated as a miss.",
        plain: "The app first checks whether it has seen this product in the last minute.",
      },
      memory: {
        tech: "A hit returns the cached row from a Map without touching the database. Entries are per-process and unbounded.",
        plain: "If it has, the product shows up straight away without waiting on storage.",
      },
    },
    card: {
      id: "demo-caching",
      repo: DEMO_REPO,
      ref: { kind: "commit", sha: cacheSha },
      url: `https://github.com/${DEMO_REPO}/commit/${cacheSha}`,
      author: AUTHOR,
      files: [file("src/cache.js", 41, 0, cacheSha), file("src/products.js", 22, 3, cacheSha)],
      explanation: caching,
    },
  },
  {
    key: "retry",
    name: "Retry fix",
    reading: "payment retries",
    sha: retrySha,
    url: `https://github.com/${DEMO_REPO}/commit/${retrySha}`,
    findings: [
      "Found 2 changed files",
      "New function: `withRetry()`",
      "Touches payment code in `src/payments/charge.js`",
    ],
    notes: {
      charge: {
        tech: "chargeCard(order) now calls withRetry(() => gateway.charge(...)) and passes order.id as the idempotency key.",
        plain: "Paying starts exactly the same way for the customer.",
      },
      gateway: {
        tech: "The gateway call itself is unchanged; it is only wrapped.",
        plain: "The bank is contacted just as before.",
      },
      error: {
        tech: "Before, any thrown error surfaced to the user immediately, including transient timeouts.",
        plain: "Before, any small hiccup meant the payment failed and the customer saw an error.",
      },
      retry: {
        tech: "isRetryable(err) is true only for network errors and 5xx responses. 4xx declines are rethrown immediately.",
        plain: "Only temporary problems are retried. A real decline, like not enough money, is not.",
      },
      wait: {
        tech: "The delay is 200 × 2ⁿ ms (200, 400, 800), capped at 3 attempts in total.",
        plain: "It waits a moment before trying again, a little longer each time, and tries at most 3 times.",
      },
      result: {
        tech: "Resolves with the charge on success; after the 3rd failure the last error is thrown.",
        plain: "Either the payment goes through, or after 3 tries the customer sees a clear message.",
      },
    },
    card: {
      id: "demo-retry",
      repo: DEMO_REPO,
      ref: { kind: "commit", sha: retrySha },
      url: `https://github.com/${DEMO_REPO}/commit/${retrySha}`,
      author: AUTHOR,
      files: [file("src/lib/retry.js", 34, 0, retrySha), file("src/payments/charge.js", 27, 6, retrySha)],
      explanation: retry,
    },
  },
];

export const sampleByCardId = (id: string) => SAMPLES.find((s) => s.card.id === id);

export function sampleByLink(owner: string, repo: string, ref: string) {
  const fullRepo = `${owner}/${repo}`.toLowerCase();
  return SAMPLES.find(
    (s) => s.card.repo.toLowerCase() === fullRepo && s.sha.startsWith(ref.toLowerCase()),
  );
}
