# TRACE — Supabase backend setup

TRACE runs **local-first**: with no Supabase configured it persists to `.trace/`
and works exactly as before. Configure Supabase to turn it into a **multi-user**
product — per-user repositories, analysis history, and graph blobs, with GitHub
login and (next increment) private-repo cloning.

Nothing here is required to run or demo TRACE locally.

---

## 1. Create a Supabase project

<https://supabase.com> → New project. Pick a region and a strong DB password.

## 2. Apply the schema

Open **SQL Editor** in the dashboard and run the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
(Or, with the Supabase CLI linked to the project: `supabase db push`.)

This creates the `repositories`, `analysis_runs`, and `graphs` tables, the
`graphs` Storage bucket, and Row-Level-Security policies so each user only ever
sees their own data.

## 3. Collect the keys — **what TRACE needs from you**

Dashboard → **Settings → API**:

| Value in Supabase | Put it in `.env` as | Exposed to browser? |
|---|---|---|
| Project URL | `SUPABASE_URL` **and** `VITE_SUPABASE_URL` | URL is safe |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` | Yes (safe — RLS protects data) |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | **No — server only, secret** |

The `service_role` key bypasses RLS; keep it out of the browser and out of git
(`.env` is already gitignored).

## 4. Set up GitHub login (for auth + private repos)

Dashboard → **Authentication → Providers → GitHub** → enable it. It asks for a
**GitHub OAuth App** Client ID + Secret:

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.
2. **Authorization callback URL**: the value Supabase shows on that provider
   screen (looks like `https://<project-ref>.supabase.co/auth/v1/callback`).
3. Paste the Client ID + Secret back into Supabase and save.
4. For **private repositories**, request the `repo` scope (TRACE asks for it at
   login) so the returned GitHub token can clone private repos.

## 5. Point TRACE at it

Copy `.env.example` → `.env` and fill in the four values from step 3. Restart the
server. Confirm it activated:

```bash
curl http://localhost:3000/api/backend/status
# { "supabaseConfigured": true, "persistence": "supabase" }
```

---

## What's wired today vs. next

**Wired (increment 1 — data layer):**
- Config-gated Supabase server store (`src/server/supabase-store.ts`).
- On analyze, when Supabase is configured **and** the request carries a signed-in
  user's token, TRACE mirrors the repo + run + graph blob to Supabase for that
  user (best-effort, never blocks the local response).
- Schema + RLS + Storage bucket migration.
- `/api/backend/status`.

**Next (increment 2 — auth):**
- Frontend GitHub login (Supabase Auth) + session, sending the user token with
  requests.
- Private-repo cloning using the user's GitHub token.
- Per-user dashboard reads (history/repos) from Supabase.

## Security notes

- `service_role` is server-only; the browser uses the `anon` key + the user's JWT,
  and RLS restricts every row to its owner.
- GitHub tokens for private repos are short-lived and used only to clone; they are
  never logged and never written into a repo's git config.
- The clone worker executes third-party code paths only through `git`/`tsc`
  parsing — it does **not** run the analyzed project's code.
