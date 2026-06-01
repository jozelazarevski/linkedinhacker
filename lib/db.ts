import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite persistence layer.
//
// We keep a single shared connection. The database stores the authenticated
// member's account + tokens, the post queue (drafts / scheduled / published),
// the engagement queue (AI-drafted comment replies awaiting human approval),
// and a lightweight analytics log.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "studio.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  _db = db;
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      member_sub      TEXT UNIQUE NOT NULL,     -- LinkedIn OpenID 'sub'
      author_urn      TEXT NOT NULL,            -- urn:li:person:{sub}
      name            TEXT,
      email           TEXT,
      picture         TEXT,
      access_token    TEXT NOT NULL,
      expires_at      INTEGER NOT NULL,         -- epoch ms
      scopes          TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      commentary      TEXT NOT NULL,
      visibility      TEXT NOT NULL DEFAULT 'PUBLIC',  -- PUBLIC | CONNECTIONS
      status          TEXT NOT NULL DEFAULT 'draft',   -- draft | scheduled | published | failed
      scheduled_at    INTEGER,                         -- epoch ms; null = not scheduled
      published_at    INTEGER,
      linkedin_urn    TEXT,                            -- urn:li:share:... after publish
      error           TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, scheduled_at);

    CREATE TABLE IF NOT EXISTS engagements (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      source_url      TEXT,                            -- link to the post being replied to
      source_text     TEXT,                            -- pasted context of the original post
      draft_comment   TEXT NOT NULL,                   -- AI-generated comment for review
      status          TEXT NOT NULL DEFAULT 'pending', -- pending | approved | dismissed | used
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id      INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      event           TEXT NOT NULL,                   -- e.g. 'post_published', 'comment_approved'
      meta            TEXT,                            -- JSON blob
      created_at      INTEGER NOT NULL
    );
  `);
}

// ── Account helpers ───────────────────────────────────────────────────────────

export interface Account {
  id: number;
  member_sub: string;
  author_urn: string;
  name: string | null;
  email: string | null;
  picture: string | null;
  access_token: string;
  expires_at: number;
  scopes: string | null;
  created_at: number;
  updated_at: number;
}

export function upsertAccount(input: {
  member_sub: string;
  author_urn: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  access_token: string;
  expires_at: number;
  scopes?: string | null;
}): Account {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO accounts
       (member_sub, author_urn, name, email, picture, access_token, expires_at, scopes, created_at, updated_at)
     VALUES
       (@member_sub, @author_urn, @name, @email, @picture, @access_token, @expires_at, @scopes, @now, @now)
     ON CONFLICT(member_sub) DO UPDATE SET
       author_urn   = excluded.author_urn,
       name         = excluded.name,
       email        = excluded.email,
       picture      = excluded.picture,
       access_token = excluded.access_token,
       expires_at   = excluded.expires_at,
       scopes       = excluded.scopes,
       updated_at   = @now`
  ).run({
    member_sub: input.member_sub,
    author_urn: input.author_urn,
    name: input.name ?? null,
    email: input.email ?? null,
    picture: input.picture ?? null,
    access_token: input.access_token,
    expires_at: input.expires_at,
    scopes: input.scopes ?? null,
    now,
  });
  return getAccountBySub(input.member_sub)!;
}

export function getAccountBySub(sub: string): Account | undefined {
  return getDb()
    .prepare("SELECT * FROM accounts WHERE member_sub = ?")
    .get(sub) as Account | undefined;
}

export function getAccountById(id: number): Account | undefined {
  return getDb()
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(id) as Account | undefined;
}

// ── Post helpers ──────────────────────────────────────────────────────────────

export interface Post {
  id: number;
  account_id: number;
  commentary: string;
  visibility: string;
  status: string;
  scheduled_at: number | null;
  published_at: number | null;
  linkedin_urn: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export function createPost(input: {
  account_id: number;
  commentary: string;
  visibility?: string;
  status?: string;
  scheduled_at?: number | null;
}): Post {
  const db = getDb();
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO posts (account_id, commentary, visibility, status, scheduled_at, created_at, updated_at)
       VALUES (@account_id, @commentary, @visibility, @status, @scheduled_at, @now, @now)`
    )
    .run({
      account_id: input.account_id,
      commentary: input.commentary,
      visibility: input.visibility ?? "PUBLIC",
      status: input.status ?? "draft",
      scheduled_at: input.scheduled_at ?? null,
      now,
    });
  return getPost(Number(info.lastInsertRowid))!;
}

export function getPost(id: number): Post | undefined {
  return getDb().prepare("SELECT * FROM posts WHERE id = ?").get(id) as
    | Post
    | undefined;
}

export function listPosts(accountId: number): Post[] {
  return getDb()
    .prepare(
      "SELECT * FROM posts WHERE account_id = ? ORDER BY COALESCE(published_at, scheduled_at, created_at) DESC"
    )
    .all(accountId) as Post[];
}

export function listDuePosts(now = Date.now()): Post[] {
  return getDb()
    .prepare(
      "SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC"
    )
    .all(now) as Post[];
}

export function updatePost(
  id: number,
  fields: Partial<Pick<Post, "commentary" | "visibility" | "status" | "scheduled_at" | "published_at" | "linkedin_urn" | "error">>
): Post | undefined {
  const keys = Object.keys(fields);
  if (keys.length === 0) return getPost(id);
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  getDb()
    .prepare(`UPDATE posts SET ${setClause}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...fields, id, updated_at: Date.now() });
  return getPost(id);
}

export function deletePost(id: number, accountId: number): void {
  getDb().prepare("DELETE FROM posts WHERE id = ? AND account_id = ?").run(id, accountId);
}

// ── Engagement helpers ────────────────────────────────────────────────────────

export interface Engagement {
  id: number;
  account_id: number;
  source_url: string | null;
  source_text: string | null;
  draft_comment: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export function createEngagement(input: {
  account_id: number;
  source_url?: string | null;
  source_text?: string | null;
  draft_comment: string;
}): Engagement {
  const db = getDb();
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO engagements (account_id, source_url, source_text, draft_comment, status, created_at, updated_at)
       VALUES (@account_id, @source_url, @source_text, @draft_comment, 'pending', @now, @now)`
    )
    .run({
      account_id: input.account_id,
      source_url: input.source_url ?? null,
      source_text: input.source_text ?? null,
      draft_comment: input.draft_comment,
      now,
    });
  return getEngagement(Number(info.lastInsertRowid))!;
}

export function getEngagement(id: number): Engagement | undefined {
  return getDb().prepare("SELECT * FROM engagements WHERE id = ?").get(id) as
    | Engagement
    | undefined;
}

export function listEngagements(accountId: number): Engagement[] {
  return getDb()
    .prepare("SELECT * FROM engagements WHERE account_id = ? ORDER BY created_at DESC")
    .all(accountId) as Engagement[];
}

export function updateEngagement(
  id: number,
  fields: Partial<Pick<Engagement, "draft_comment" | "status">>
): Engagement | undefined {
  const keys = Object.keys(fields);
  if (keys.length === 0) return getEngagement(id);
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  getDb()
    .prepare(`UPDATE engagements SET ${setClause}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...fields, id, updated_at: Date.now() });
  return getEngagement(id);
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

export function logEvent(accountId: number | null, event: string, meta?: unknown): void {
  getDb()
    .prepare(
      "INSERT INTO analytics_log (account_id, event, meta, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(accountId, event, meta ? JSON.stringify(meta) : null, Date.now());
}

export function analyticsSummary(accountId: number) {
  const db = getDb();
  const posts = listPosts(accountId);
  const published = posts.filter((p) => p.status === "published");
  const scheduled = posts.filter((p) => p.status === "scheduled");
  const drafts = posts.filter((p) => p.status === "draft");

  // Posting cadence: published posts grouped by ISO week.
  const byWeek: Record<string, number> = {};
  for (const p of published) {
    if (!p.published_at) continue;
    const d = new Date(p.published_at);
    const week = isoWeekKey(d);
    byWeek[week] = (byWeek[week] || 0) + 1;
  }

  const engagements = listEngagements(accountId);

  return {
    totals: {
      published: published.length,
      scheduled: scheduled.length,
      drafts: drafts.length,
      commentsApproved: engagements.filter((e) => e.status === "approved" || e.status === "used").length,
      commentsPending: engagements.filter((e) => e.status === "pending").length,
    },
    cadenceByWeek: Object.entries(byWeek)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([week, count]) => ({ week, count })),
    lastPublishedAt: published[0]?.published_at ?? null,
  };
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
