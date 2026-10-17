# Rosetta backend

API-only Next.js 16 app between the browser and GitHub, Gemini and Firestore. Every key lives here.

## Run

```bash
npm install
cp .env.example .env.local   # set SESSION_SECRET at least for `npm start`
npm run dev                  # http://localhost:4000
```

With no keys it still runs: the three demo commits are served from hand-written explanations, Ask Why answers them from written notes, and data goes to `.data/store.json`. Add keys as you need them:

| Key | Unlocks |
| --- | --- |
| `GITHUB_TOKEN` | Real commits beyond 60 requests an hour, repository sync |
| `GEMINI_API_KEY` | Explaining any commit, Ask Why on any commit, translating comments and replies for each role, personal notes |
| `FALLBACK_API_KEY` | Groq or OpenRouter when Gemini fails |
| `FIREBASE_*` | Firestore instead of the local file (needed on Vercel) |
| `SESSION_SECRET` | Signs login tokens; required in production |
| `ALLOWED_ORIGINS` | The frontend's origin(s) for CORS |

## How it's organised

- **Workspaces and a reporting tree.** A CMO or a manager creates the workspace (`/api/auth/signup`). Leads add people under them (`/api/team/members`), who join with an invite code (`/api/auth/join`). CMO → managers → engineers, senior devs, interns; clients sit under the manager who added them.
- **Role = reading level.** Every response is written at the viewer's role. A manager can't switch to the intern version; logging in as a manager means reading as one.
- **Who sees what.** Engineers and interns see their own changes. A manager sees everyone below them. A CMO sees the whole workspace. Clients see reviewed changes of their manager's team. Cards outside that answer `404`.
- **Changes arrive by themselves.** Leads list repositories to watch (`PATCH /api/org`). New commits by members (matched by GitHub username) are explained through a GitHub webhook (`/api/webhooks/github?org=…`, signed with the workspace secret) or a sync (`POST /api/sync`, also run in the background when a feed is older than 5 minutes). GitHub comments by engineers in those repos are pulled in too.
- **Detailed flowcharts.** Each explanation has a before and after graph with step, decision, data, start and end nodes, groups and labelled edges, plus a worked example (`walkthrough`) whose steps trace a path through the after graph. Labels and walkthrough text exist at all six levels.
- **Comments and questions.** Engineers comment on changes; leads read them at their own level, filtered by engineer or team. Anyone can open a question (ticket) to people they manage or report to, with or without a change attached. Ask Why answers from the diff, or returns a technical rewrite and who to ask, so the app opens a question to that engineer. Every comment and message is translated for all six levels once, when it's written.

## Routes

Send `Authorization: Bearer <token>` once logged in. Errors are `{ code, message }`.

| Route | Who | Does |
| --- | --- | --- |
| `POST /api/auth/signup` | anyone | Create a workspace as `cmo` or `manager` |
| `POST /api/auth/login` | anyone | Email + password |
| `GET /api/invites/:code` · `POST /api/auth/join` | invitee | Look up and accept an invite |
| `GET` · `PATCH /api/me` | signed in | Profile and preferences (not role) |
| `GET /api/team` | signed in | People, who you manage and can message, invite codes, repos, webhook |
| `POST /api/team/members` · `PATCH /api/team/members/:id` | leads | Add someone (returns an invite code) · edit title, GitHub, team name |
| `PATCH /api/org` | leads | Name and watched repositories |
| `POST /api/sync` | leads | Pull new commits and comments now |
| `POST /api/webhooks/github?org=` | GitHub | Pushes and comments, HMAC-verified |
| `GET /api/feed?author=&team=&status=` | signed in | Changes for this person, at their level, plus filters and stats |
| `POST /api/explain` | signed in | Explain a pasted link (NDJSON stream) |
| `GET /api/cards/:id` | can see it | The change at the viewer's level, with comments |
| `GET /api/cards/:id/for-me` | can see it | A two-sentence personal note |
| `POST /api/cards/:id/comments` | engineers | Add a comment |
| `GET /api/comments?author=&team=` | signed in | Comments from people you can see |
| `POST /api/approve` | the author | Edit and mark reviewed |
| `POST /api/ask` | can see it | Answer from the code, or who to ask |
| `GET` · `POST /api/tickets` | signed in | Your questions · ask someone |
| `GET` · `POST` · `PATCH /api/tickets/:id` | participants | Read (marks read) · reply · close or reopen |
| `POST /api/demo/seed` | leads | Add a sample team with changes, comments and a question |

## Sample team

On an empty workspace, "Add a sample team" creates Arjun (engineer), Priya (senior dev) and Rahul (intern) under the manager (a CMO also gets a manager, Neha). Each can log in with the email shown and the password `rosetta-demo`, so every role's view can be tried.

## Known limits

- No email verification, password reset or login rate limiting yet.
- The webhook needs the server reachable from GitHub (deployed, or a tunnel).
- Sync explains at most 6 new commits per run to bound model calls.
