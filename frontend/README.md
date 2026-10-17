# Rosetta frontend

Next.js 16 + Tailwind v4. Visual rules come from `design.md`. The app needs the backend in `../backend`.

## Run

```bash
# terminal 1
cd ../backend && npm install && npm run dev      # http://localhost:4000
# terminal 2
npm install && npm run dev                       # http://localhost:3000
```

`NEXT_PUBLIC_API_BASE` defaults to `http://localhost:4000`. Create a workspace, then press **Add a sample team** to see every role.

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/` | everyone | What Rosetta is, the slider demo, the detailed flowchart with its worked example, how changes reach people |
| `/signup` · `/join` · `/login` | | Create a workspace (CMO or manager) · join with an invite code · log in |
| `/app` | by role | Engineer and intern: **My work** (their changes, questions for them). Manager: **Team activity** (team changes filtered by engineer, stats, engineers' latest comments, check in with anyone). CMO: **Overview** (teams, then changes filtered by team or person). Client: reviewed **Updates** |
| `/app/c/[id]` | can see it | One change at the reader's own level (no level switch): story, engineers' comments, "How it works" flowchart with before/after and a step-through example, Ask Why, review bar for the author |
| `/app/updates` | leads | Engineers' comments (Rosetta and GitHub), by engineer or team |
| `/app/questions` · `/app/questions/[id]` | everyone | Questions asked of me / by me; threads rewritten for each reader |
| `/app/team` | leads | People by team, add someone (invite code), watched repositories, sync, webhook setup |
| `/app/profile` | everyone | Name, title, GitHub username, focus, language |

## Where things are

- `src/components/flowchart.tsx`: `FlowDiagram` (JSON → Mermaid with shapes, groups and edge labels; path highlighting) and `HowItWorks` (before/after + walkthrough)
- `src/components/dashboards.tsx`: the per-role homes
- `src/lib/roles.ts`: roles, tabs per role
- `src/lib/api.ts`: every backend call; `src/lib/session.tsx`: login state
- `src/lib/mock/samples.ts`: the demo commits (shared with the backend), used on the landing page
