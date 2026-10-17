# Prompt: add login, profile cards and personalised explanations to the Rosetta frontend

You are working in `frontend/`, the Next.js 16 + Tailwind v4 app for **Rosetta**, a tool that explains any GitHub commit at six reader levels (Engineer, Senior dev, Intern, Manager, Client, CMO). Read these before you change anything:

- `design.md` (repo root, if present) and `frontend/src/app/globals.css`: the visual system. Every new screen must use its tokens, type scale (`t-display`, `t-title`, `t-heading`, `t-body`, `t-small`, `t-micro`), radius scale, glass rules and motion rules.
- `frontend/README.md`: what exists today.
- `backend/README.md`: the API you will call. It is already built and running on `http://localhost:4000`.

The frontend currently has no idea who is reading. Your job: let people log in with a short profile, then show every card at *their* level with a note written for them.

## 1. What to build

### 1.1 Login and the profile card

Add a `/login` page whose main element is a **profile card**: one solid `--surface-1` card (`--r-md`, Elevation 1, padding 32) that people fill in. Left-aligned, max width `--w-read`.

Fields, in this order:

| Field | Control | Required | Sent as |
| --- | --- | --- | --- |
| Name | text input | yes | `name` |
| Email | email input | yes | `email` |
| How technical are you? | 6 large radio cards, one per level, each with a one-line description (see below) | yes | `role` |
| Job title | text input, placeholder "Product manager" | no | `title` |
| Company or team | text input | no | `organization` |
| GitHub username | text input, only shown when the role is `engineer`, `senior` or `intern`; helper text: "Lets you approve explanations of your own commits." | no | `githubLogin` |
| What do you care about most? | multi-select chips: Timelines, Cost, Risk, How it works, What users notice | no | `focus`: `timelines`, `cost`, `risk`, `how-it-works`, `user-impact` |
| Language for simple explanations | segmented control: English / Hinglish | no, default English | `language`: `en` or `hinglish` |

Role radio cards (label, then description in `--text-2`):

- `engineer`: **Engineer**. "I write code and want the technical detail."
- `senior`: **Senior developer**. "I review code and want a quick technical summary."
- `intern`: **Intern or learner**. "I'm learning the codebase and want the how and why."
- `manager`: **Manager**. "I need impact, risk and whether plans change."
- `client`: **Client**. "I want to know what the work means for my business."
- `cmo`: **CMO**. "I lead marketing. Tell me what it means for customers and growth."

Under the form, show a **live preview**: the round-robin demo summary (from `src/lib/mock/samples.ts`) at the level currently selected, swapping with the existing `LevelSwap` crossfade as the role changes. It shows people what their choice means. One primary button at the bottom: **Create profile**, or **Save profile** when editing.

Submit with `POST /api/auth/login`. It returns `{ token, user, created }`. Validation errors come back as `400 { code: "bad_request", message }`; show them inline under the relevant field, never as a toast.

### 1.2 Session

- Create `src/lib/session.tsx`: a React context (`SessionProvider`, `useSession()`) holding `{ user, token, status: "loading" | "anonymous" | "signed-in", login(profile), updateProfile(patch), logout() }`.
- Store the token in `localStorage` under `rosetta:token`, wrapped in try/catch. On load, call `GET /api/me` to restore the user; a 401 clears the token.
- `logout()` only forgets the token on the client; there is no logout route.
- Update `src/lib/api.ts` so **every** request sends `Authorization: Bearer <token>` when signed in. Add `login`, `getMe`, `updateMe` and `getForMe(cardId)` to it.
- Keep sample-data mode working when `NEXT_PUBLIC_API_BASE` is unset: mock `login` and `me` in `src/lib/mock/server.ts`, store the profile in `localStorage`, and have the mock `for-me` return `null` for the note.

### 1.3 Home page

design.md says the home page has **one job: get a commit link pasted**. Keep the hero and the mini slider demo exactly as they are. Add login without turning the page into a landing page:

- Nav, signed out: a ghost **Log in** link next to GitHub and the theme toggle (three items at most).
- Nav, signed in: replace **Log in** with a profile pill (initials avatar + first name). It opens a small menu (Base UI Menu, scale from the trigger, 200ms) with **Edit profile**, which goes to `/login?edit=1`, and **Log out**.
- Signed in: the hero subline becomes personal, e.g. "Paste a GitHub link. Rosetta explains it for a manager like you." Use the role label in lower case.
- Signed out: pressing **Explain** or a sample chip opens the profile card in the existing glass side sheet (desktop) or Vaul drawer (mobile) instead of navigating away. After a successful login, continue the explain the user started. Don't make them press the button again.
- The mini demo starts at the signed-in user's level instead of Engineer, but still plays its one-time glide.

### 1.4 Personalised card view (`/c/[id]`)

The backend card response now includes `viewer: { canApprove: boolean, level: LevelKey | null }`.

- **Starting level:** start the Bridge Slider at `viewer.level`, or at Manager when signed out. The slider stays fully movable.
- **"For you" note:** when signed in, call `GET /api/cards/:id/for-me`, which returns `{ level, note }`. If `note` isn't null, show it at the top of the Story Card, above the summary, as a short block: `t-small` label "For you, {first name}" in `--text-3`, the note in `t-body` `--text-1`. It does **not** crossfade with the slider; it's about the person, not the level. Show nothing while it loads (no skeleton) and nothing if it's null.
- **"Your level" marker:** put a small `t-micro` "You" marker under the user's own stop in the full slider's labels. When they move away, show a ghost button **Back to my level** next to the slider. Keyboard moves are still instant.
- **Review mode:** show engineer review (inline editing + the **Approve and share** bar) only when `viewer.canApprove` is true **and** the card is a draft. Everyone else sees the reader view, even for drafts, with a quiet `t-small` line: "Waiting for {author first name} to approve this explanation."
- **Approve errors:** a `403 forbidden` from approve gets the toast "Only {author first name} can approve this." A 401 opens the login sheet.
- **Ask Why:** the panel sends the reader's current slider level (it already does) plus the token. The confirm step should read "Rosetta will ask {engineer} on GitHub for you, {first name}:".
- **Signed-out readers:** the shared link still works (PRD: a manager opens it without a GitHub account). Show the card at Manager with a `t-small` line under the title: "Make a profile to see this explained for you." The words "Make a profile" are a link that opens the login sheet. When they finish, refetch the card and the note without a page reload.

### 1.5 Profile editing

`/login?edit=1` shows the same card prefilled. Saving calls `PATCH /api/me` (email is read-only there) and shows the toast "Profile saved." If the user came from a card, return them to it.

## 2. API reference (already live)

```
POST  /api/auth/login        { name, email, role, title?, organization?, githubLogin?, focus?, language? }
                             → { token, user, created }
GET   /api/me                → { user }                               (401 when the token is missing or bad)
PATCH /api/me                { any profile field except email } → { user }
GET   /api/cards/:id         → Card & { viewer: { canApprove, level } }
GET   /api/cards/:id/for-me  → { level, note: string | null }        (auth required)
POST  /api/approve           { cardId, edits } → { card }             (auth required; 403 if not the engineer)
```

`User` = `{ id, email, name, role, title?, organization?, githubLogin?, focus[], language, createdAt, updatedAt }`. Copy the server types from `backend/src/lib/types.ts` (`User`, `Focus`, `Viewer`) into `frontend/src/lib/types.ts`.

## 3. Design rules that apply here

- The profile card and login page are reading or typing surfaces: **solid, never glass**. Glass is only for the sheet or drawer that holds the card when it opens over the home page.
- One primary button per view. The role radio cards are not buttons: give them `--surface-2`, a `--ring` edge and, when selected, a 2px Steel ring plus `--text-1` text. They scale to 0.97 when pressed.
- Inputs are at least 16px, use `--r-sm` and get the `--ring-strong` edge. Labels sit above inputs, in sentence case.
- No new colours, no gradients, no "Welcome!" or exclamation marks, no illustrations, no feature lists.
- Copy uses plain verbs: "Create profile", "Save profile", "Log in", "Log out", "Back to my level".
- Reduced motion, keyboard access and visible focus rings work on every new control. The role radio group uses arrow keys.

## 4. Done when

- [ ] Signing up as a Manager, pasting the round-robin sample and opening the card puts the slider at Manager and shows the "For you" note (when the backend has an AI key).
- [ ] Signing up as a CMO opens the same card at CMO.
- [ ] An engineer whose GitHub username matches the commit author sees the review bar; a manager opening the same draft doesn't.
- [ ] A signed-out visitor can open a shared `/c/:id` link, read it at Manager, and make a profile from the inline link without losing their place.
- [ ] A reload keeps the session; **Log out** clears it.
- [ ] Sample-data mode (no `NEXT_PUBLIC_API_BASE`) still runs the whole flow.
- [ ] `npm run typecheck` and `npm run build` pass, and there is no horizontal scroll at 390px.
