# Cruci cuando quieras — AI handoff

This is a Next.js + FastAPI app that turns supplied horizontal and vertical answers into a playable crossword. Its current priority is multiplayer: a creator generates a grid, creates a shareable room, and players race while a leaderboard tracks solved words and finish time.

## Quick path

1. Open the project at `D:\projectos\programacion\crusigramas`.
2. Run backend tests: `python -m unittest discover -s backend -v`.
3. Run the frontend locally: `cd frontend; npm run dev`.
4. Production is deployed at [cruci-cuando-quieras.vercel.app](https://cruci-cuando-quieras.vercel.app/).

## Product rules

- Input format: one entry per line: `number | clue | answer`.
- Across and down entries with the same number must begin in the same cell.
- The generator receives a configurable square grid size; black cells fill unused cells.
- The board is the visual focus, with down clues on the left and across clues on the right.
- A solved word becomes blue-gray and cannot be edited.
- Keyboard behavior:
  - `Space`: switch direction at an intersection.
  - `Tab` / `Shift+Tab`: next / previous clue within current direction.
  - Arrow along current direction: move in the word.
  - Perpendicular arrow: nearest word in the same current direction.
  - Typing and Backspace skip locked solved cells.
- Completing a word automatically selects the next unsolved word in the same direction first.

## Architecture

| Area | Implementation |
|---|---|
| Frontend | Next.js 16 client UI in `frontend/app/page.tsx` |
| Generator | Python DFS/backtracking in `backend/crossword_generator.py` |
| API | FastAPI in `backend/main.py` |
| Deployment | Vercel Services: `frontend/` (Next.js), `backend/` (FastAPI) |
| Database and realtime | Supabase project `jcurbxuqitmrbrjcpdft` |
| CAPTCHA | Cloudflare Turnstile + Supabase Auth CAPTCHA |

### Important files

- `vercel.json` — Vercel Services and `/api/*` routing.
- `backend/main.py` — generator endpoints and all room APIs.
- `backend/crossword_generator.py` — crossword generation algorithm.
- `backend/test_crossword_generator.py` — generator tests.
- `backend/test_main.py` — prevents exposing solution letters in public room puzzles.
- `frontend/app/page.tsx` — creation flow, game UX, rooms, CAPTCHA, realtime leaderboard.
- `frontend/app/supabase.ts` — browser anonymous auth client.
- `frontend/app/globals.css` — layout and game styling.
- `.env.example` — environment variable names only; never commit real values.

## Multiplayer design

### Security model

The browser must never receive the room solution. When a room is created:

1. `crossword_rooms.puzzle` stores a public board where each `grid[].letter` is `null`.
2. `crossword_room_solutions.solution` stores letters privately.
3. FastAPI uses the Supabase server secret to validate an attempted complete word.
4. Browser clients use anonymous Supabase sessions plus RLS for room membership and Realtime.

The `crossword_room_solutions` table intentionally has RLS with **no public policy**. Supabase reports this as an informational linter notice; it is intentional because only the server key may read it.

### Tables

- `crossword_rooms`: shareable slug, title, public puzzle, grid size.
- `crossword_room_solutions`: private answer grid.
- `crossword_players`: anonymous user, room, display name, start and finish timestamps.
- `crossword_word_completions`: player/word completion events.

`crossword_players` and `crossword_word_completions` are in the Supabase Realtime publication.

### API endpoints

- `POST /api/generate`
- `POST /api/rooms`
- `POST /api/rooms/{slug}/join`
- `POST /api/rooms/{slug}/start`
- `GET /api/rooms/{slug}/progress`
- `POST /api/rooms/{slug}/complete`

All room endpoints require a Supabase anonymous-user Bearer token. The frontend creates it through `signInAnonymously()` only after a Turnstile token is available.

## Required configuration

### Vercel (Production)

Set these values in Vercel; do not commit them:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
```

The backend also accepts legacy `SUPABASE_SERVICE_ROLE_KEY`, but `SUPABASE_SECRET_KEY` is preferred. Secret keys must be Vercel **Secret** values, never `NEXT_PUBLIC_*`.

### Supabase

- Enable **Allow anonymous sign-ins** under Authentication → Sign In / Providers, then save.
- Enable CAPTCHA in Authentication → Attack Protection.
- Select **Turnstile by Cloudflare** and save its Secret Key.

### Cloudflare Turnstile

Add the production hostname exactly:

```text
cruci-cuando-quieras.vercel.app
```

The preview hostname can be added too. Turnstile tokens are single-use; the frontend resets the widget after each attempt.

## Current status and known issue

Recent commits:

- `9b4ea3c fix: support Supabase secret keys`
- `feec2f9 feat: add multiplayer leaderboard`
- `79348a2 feat: protect anonymous rooms with captcha`

The deployed backend was checked after configuring the secret and returned the expected unauthenticated `401`, not the prior missing-config `503`. If room creation still fails:

1. Hard refresh the deployed site (`Ctrl+F5`) so it uses the latest frontend.
2. Complete a fresh Turnstile challenge and click Create Room once.
3. Check Supabase Auth logs. `anonymous_provider_disabled` means Anonymous Sign-Ins was not saved. `captcha_failed` means the token is missing, expired, or already used.
4. Check Vercel deployment logs if the API returns another `5xx`.

Browser console messages about `Permissions-Policy`, WebGPU, WOFF, or Turnstile's internal `data:,` CSP calls are noisy browser/Turnstile diagnostics. They are not the primary API failure; use the actual `/api/rooms` status and Supabase Auth logs.

## Verification

```powershell
cd D:\projectos\programacion\crusigramas
python -m unittest discover -s backend -v
cd frontend
npm run build
```

The last known verification passed: 7 Python tests and the Next.js production build.

## Git discipline

- Remote: `git@github.com:kalchiCCQ/Cruci-Cuando-Quieras.git`
- Branch: `main`
- Do not add `Co-Authored-By` or AI attribution to commits.
- Do not stage local-only `.atl/`, `AGENTS.md`, or `referencias/` files.
