# LinkedIn Growth Studio

A full-stack web app that helps you **grow your LinkedIn audience the legitimate
way** — built entirely on LinkedIn's **official OAuth API**, so it won't get
your account restricted or banned.

> ⚠️ **About "LinkedIn hacking" tools:** LinkedIn's
> [User Agreement](https://www.linkedin.com/legal/user-agreement) explicitly
> prohibits bots, scraping, and automated activity (auto-liking, auto-commenting
> on other people's posts, follow/unfollow churn). Tools that do this rely on
> undocumented endpoints or headless browsers and routinely get accounts
> **permanently banned**. This project deliberately does **none** of that.
> Instead it uses sanctioned APIs and a human-in-the-loop workflow to grow your
> presence sustainably.

## What it does

| Goal | How this app does it |
| --- | --- |
| 📝 **Post new posts** | Compose, publish instantly, or **schedule** posts via the official LinkedIn Posts API |
| 📈 **Grow followers** | Consistent scheduled content + a **content calendar** + cadence analytics (consistency is the #1 growth driver) |
| 🧩 **Post templates** | A library of proven frameworks (lessons, story, how-to, contrarian…) to start from or feed the AI |
| 🗣 **Your voice** | Train the app on your own posts so every draft/rewrite/comment sounds like **you** — plus a one-click **Humanize** that strips AI tells |
| 🤖 **AI assistance** | Generate value-first post drafts and rewrites with the Anthropic API |
| 💬 **Like & comment** | An **engagement queue**: the AI drafts thoughtful comment replies; you review, edit, and post them yourself (no ToS-violating auto-spam) |
| 🎯 **Engagement cockpit** | Save posts & people to engage with, **batch-draft** voice-matched comments and connection notes, and work a **daily sprint** checklist — you make the final click on LinkedIn |

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** — full-stack web app
- **SQLite** (`better-sqlite3`) — local persistence, zero external DB
- **Anthropic SDK** — optional AI drafting
- A small **background worker** that publishes scheduled posts when they're due

## Architecture

```
app/
  api/
    auth/{login,callback,logout}   OAuth 2.0 (OpenID Connect) sign-in
    me                             session + capability flags
    posts/                         create / list / update / delete / publish
    ai/draft                       AI post drafting & rewriting
    engagements/                   comment-reply approval queue
    analytics                      posting cadence + totals
  components/                      Compose, Posts, Engage, Analytics (client UI)
  page.tsx                         dashboard orchestrator
lib/
  linkedin.ts                      official LinkedIn API client
  ai.ts                            Anthropic drafting helpers
  db.ts                            SQLite schema + queries
  publisher.ts                     shared publish logic
  session.ts                       signed-cookie sessions
scripts/
  worker.ts                        scheduled-post publisher (poll loop)
  init-db.ts                       create the SQLite database
```

## Setup

### 1. Create a LinkedIn app

1. Go to <https://www.linkedin.com/developers/apps> → **Create app**.
2. Add these **products** (under the *Products* tab):
   - **Sign In with LinkedIn using OpenID Connect** → grants `openid profile email`
   - **Share on LinkedIn** → grants `w_member_social` (lets the app post on your behalf)
3. Under **Auth**, add this exact **Authorized redirect URL**:
   ```
   http://localhost:3000/api/auth/callback
   ```
4. Copy your **Client ID** and **Client Secret**.

### 2. Configure environment

```bash
cp .env.example .env.local
# then edit .env.local and fill in:
#   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
#   SESSION_SECRET   (generate with: openssl rand -hex 32)
#   ANTHROPIC_API_KEY (optional, enables AI drafting)
```

### 3. Install & run

```bash
npm install
npm run db:init        # create the local SQLite database (optional; auto-created on first use)
npm run dev            # start the web app at http://localhost:3000
```

In a second terminal, start the scheduler so scheduled posts actually publish:

```bash
npm run worker
```

Open <http://localhost:3000>, click **Sign in with LinkedIn**, and you're in.

## How the scheduler works

`npm run worker` runs a small loop (default every 60s, set `WORKER_INTERVAL_MS`
to change it) that finds posts whose `scheduled_at` time has passed and
publishes them through the official Posts API, then marks them `published`. The
web app and worker share the same SQLite database, so you can also hit
**Publish now** in the UI at any time.

## Writing in your own voice (no more "AI sludge")

Go to **Compose → 🗣 Your voice**, paste 2–5 of your own LinkedIn posts, and hit
**Train my voice**. The app distills a style guide from your samples and feeds
both the guide *and* your real posts into every generation as examples. From
then on:

- **Generated drafts** match your rhythm, vocabulary, formality, and emoji/hashtag habits.
- **Rewrites** (✂ More concise, ↑ Stronger hook, etc.) stay on-voice.
- **🧑 Humanize / match my voice** rewrites any text to remove the usual AI tells
  (no "delve", "leverage", "it's not X, it's Y", em-dash overuse, robotic lists)
  and sound like a real person — specifically, like you.
- **Comment drafts** in the Engage tab also use your voice.

## Deploying online

This app has two moving parts: the **web app** and a **scheduler** that publishes
queued posts when they're due. How you host them depends on the platform.

### Option A — Vercel (this repo is Vercel-ready)

1. Push the repo to GitHub and **Import the project** at <https://vercel.com/new>.
2. Add the environment variables from `.env.example` in the Vercel dashboard
   (Project → Settings → Environment Variables). Set `APP_BASE_URL` and
   `LINKEDIN_REDIRECT_URI` to your real Vercel URL, e.g.
   `https://your-app.vercel.app` and `https://your-app.vercel.app/api/auth/callback`
   — and add that callback URL to your LinkedIn app's authorized redirect URLs.
3. Set `CRON_SECRET` to a random string. `vercel.json` already registers an
   hourly **Cron Job** that hits `/api/cron/publish` to publish due posts (no
   separate worker process needed). *Note: Vercel's Hobby plan runs crons at most
   once per day; the Pro plan allows the hourly schedule defined here.*

   ⚠️ **Storage caveat:** Vercel's filesystem is ephemeral, so the bundled SQLite
   database in `/tmp` **does not persist** across deploys/cold starts. For real
   use on Vercel, point `DATABASE_PATH` at a durable store — the easiest is a
   free [Turso](https://turso.tech) (libSQL, SQLite-compatible) database, or
   Vercel Postgres. (`lib/db.ts` is the single integration point to swap.)

### Option B — Railway / Render / Fly.io / a VPS (recommended, runs as-is)

These give you a **persistent disk** and let you run **two processes**, so the
app works unchanged with its bundled SQLite DB:

- **web:** `npm run build && npm run start`
- **worker:** `npm run worker`

Set the same env vars, mount a volume for `./data`, and you're done — no DB swap
required.

## Notes & limitations (honest version)

- **Personal post analytics:** LinkedIn's API does **not** expose per-post
  impression/reaction counts for personal profiles (those endpoints are gated to
  Organization pages and approved Marketing partners). So the Analytics tab
  focuses on what genuinely drives growth and what we *can* measure: your
  posting **consistency**. To see reactions/comments, open the post on LinkedIn.
- **Commenting on others' posts via API** is not available for personal
  accounts, which is exactly why the engagement feature is copy-paste with human
  approval rather than automated.
- **Token expiry:** LinkedIn access tokens last ~60 days. When yours expires the
  app will prompt you to sign in again. (Refresh tokens require additional app
  approval from LinkedIn.)
- **Keep secrets out of git:** `.env.local` and `/data` are gitignored. Never
  commit your client secret or tokens.

## Growth playbook (the part no tool can fake)

1. **Post consistently** — 3–5×/week beats sporadic bursts. Use scheduling.
2. **Lead with value** — teach, tell a real story, or share a specific result.
3. **Engage genuinely** — leave thoughtful comments (use the queue) within the
   first hour on posts in your niche.
4. **Reply to every comment** on your own posts — it boosts reach and builds
   relationships.
5. **Be patient** — real audiences compound. Shortcuts (bots) get you banned.
