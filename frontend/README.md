# Rosetta frontend

Next.js 16 + Tailwind v4 frontend for Rosetta. Visual rules come from `design.md`; flows and data shapes come from the PRD.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
```

With no `.env.local`, the app runs fully on **sample data**: the three demo commits (round-robin, caching, retry fix), including loading narration, engineer review, approval, Ask Why and a simulated engineer reply about 12 s after a question is sent. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_BASE` to use a real backend.

## Screens

| Route | What it is |
| --- | --- |
| `/` | Hero, glass link input, sample chips, loading narration, mini slider demo |
| `/c/[id]` | Card view. Draft cards open in engineer review (inline edit + "Approve and share"); approved cards are the shared reader view |

## API contract (what the backend needs to serve)

All routes are relative to `NEXT_PUBLIC_API_BASE`. Types live in [src/lib/types.ts](src/lib/types.ts).

| Route | Request | Response |
| --- | --- | --- |
| `POST /api/explain` | `{ url }` | `Card` as JSON, **or** `application/x-ndjson` lines: `{type:"start",title}`, `{type:"finding",text}` (backticks mark code names), `{type:"writing"}`, then `{type:"card",card}`. Streaming drives the loading screen (FR-6.1). |
| `GET /api/cards/:id` | | `Card` |
| `POST /api/approve` | `{ cardId, edits }` | `{ card }` |
| `POST /api/ask` | `{ cardId, nodeId, nodeKey, level, question }` | `{ answerable: true, answer }` or `{ answerable: false, technicalQuestion }` |
| `POST /api/ask` | same + `{ send: true, technicalQuestion }` | `{ questionId, commentUrl? }` once the `[Rosetta]` comment is posted |
| `GET /api/reply?questionId=` | | `{ status: "waiting" }` or `{ status: "answered", reply, translatedReply }` (polled every 15 s) |

Errors: any non-2xx with `{ code }` where code is `invalid_url`, `private`, `not_found` or `unavailable`.

`Card.explanation` is the PRD's explain schema, with one addition: an optional `riskReason` string, which the risk badge tooltip shows.

## Where things are

- `src/app/globals.css`: design tokens (both themes), type scale, glass material and fallbacks, motion and reduced-motion rules
- `src/components/bridge-slider.tsx`: the signature slider (drag with velocity projection + spring snap, instant keyboard moves, full, mini and dock variants)
- `src/components/flowchart.tsx`: JSON → Mermaid, rendered once; level labels crossfade inside fixed boxes; falls back to a step list
- `src/lib/mock/`: sample commits and the in-browser stand-in for the API
