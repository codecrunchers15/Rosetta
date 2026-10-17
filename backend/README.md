# Rosetta backend

API-only Next.js 16 app that sits between the browser and GitHub, Gemini and Firestore (PRD, "Technical architecture"). The browser never calls those services directly; every key lives here.

## Run

```bash
npm install
cp .env.example .env.local   # set SESSION_SECRET at least for `npm start`
npm run dev                  # http://localhost:4000
```

Point the frontend at it with `NEXT_PUBLIC_API_BASE=http://localhost:4000` in `frontend/.env.local`.

With no keys at all it still runs. The three demo commits are served from pre-generated explanations, even with no network, and data is saved to `.data/store.json`. Add keys as you need them:

| Key | Unlocks |
| --- | --- |
| `GITHUB_TOKEN` | Real commits beyond the anonymous limit of 60 requests an hour, and posting Ask Why comments |
| `GEMINI_API_KEY` | Explaining any commit, Ask Why answers, reply translation, personal notes |
| `FALLBACK_API_KEY` | Groq or OpenRouter, used when Gemini fails or is rate-limited |
| `FIREBASE_*` | Firestore instead of the local JSON file (needed on Vercel, whose disk is read-only) |
| `SESSION_SECRET` | Signs login tokens; required in production |

`GET /api/health` shows what's configured.

## Routes

Send `Authorization: Bearer <token>` (from login) on every request when the user is logged in. Errors are always `{ code, message }` with a matching HTTP status. Codes: `invalid_url`, `bad_request`, `unauthorized`, `forbidden`, `private`, `not_found`, `unavailable`.

| Route | Auth | Request | Response |
| --- | --- | --- | --- |
| `POST /api/auth/login` | no | `{ name, email, role, title?, organization?, githubLogin?, focus?, language? }` | `{ token, user, created }` |
| `GET /api/me` | yes | | `{ user }` |
| `PATCH /api/me` | yes | any profile field except `email` | `{ user }` |
| `POST /api/explain` | optional | `{ url }` | NDJSON stream: `start`, `finding`…, `writing`, then `card` (or `error`) |
| `GET /api/cards/:id` | optional | | `Card & { viewer: { canApprove, level } }` |
| `GET /api/cards/:id/for-me` | yes | | `{ level, note }`, where `note` is null without an AI key |
| `POST /api/approve` | yes, engineer | `{ cardId, edits }` | `{ card }` |
| `POST /api/ask` | optional | `{ cardId, nodeId, nodeKey, level, question }` | `{ answerable: true, answer }` or `{ answerable: false, technicalQuestion }` |
| `POST /api/ask` | optional | same + `{ send: true, technicalQuestion }` | `{ questionId, commentUrl }` |
| `GET /api/reply?questionId=` | no | | `{ status: "waiting" }` or `{ status: "answered", reply, translatedReply }` |
| `GET /api/health` | no | | which services are configured |

`role` is one of `engineer`, `senior`, `intern`, `manager`, `client`, `mom` (shown to people as "Family or friend"), and doubles as the reader's default slider level. `focus` is any of `timelines`, `cost`, `risk`, `how-it-works`, `user-impact`.

## How it behaves

- **One card per commit or PR.** The card id comes from the repo and short SHA (or PR number). Explaining the same link again replays the stored findings and never calls GitHub or the model.
- **Explanations are cached by `repo@sha`.** All six levels come from one Gemini call with a strict response schema. The output is validated and repaired: duplicate edges and edges to unknown nodes are dropped, and a missing label borrows from the nearest level, so "My mom" never gets engineer words.
- **Diffs are never stored.** They're trimmed to the 400 most-changed lines for the model. Ask Why re-fetches the diff and keeps it in memory for 10 minutes.
- **Approval:** allowed for the user who explained the commit, or a user whose `githubLogin` matches the commit author.
- **Ask Why replies:** `/api/reply` checks GitHub at most every 10 seconds per question. The first comment after the `[Rosetta]` one that doesn't contain `[Rosetta]` counts as the reply, and it's translated to the reader's level.

## Known limits (hackathon scope)

- Login has no password or email check: anyone can sign in as any email. Swap in Firebase Auth or Google sign-in before real use.
- Ask Why comments are posted with the server's `GITHUB_TOKEN`, so they appear under that account.
