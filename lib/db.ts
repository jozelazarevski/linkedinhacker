import type { Client, InArgs } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Persistence layer (libSQL / Turso).
//
// - In production (Vercel), set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN). We use
//   the pure-fetch web client, which is serverless-friendly and shares one
//   durable database across all function invocations — essential, because each
//   Vercel invocation may run on a different instance with its own /tmp.
// - Locally (no TURSO_DATABASE_URL), we fall back to an embedded SQLite file via
//   the node client. The query API is identical, so the same code runs in both.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FILE = process.env.VERCEL
  ? "/tmp/studio.db"
  : path.join(process.cwd(), "data", "studio.db");
const FILE_PATH = process.env.DATABASE_PATH || DEFAULT_FILE;

async function makeClient(): Promise<Client> {
  if (process.env.TURSO_DATABASE_URL) {
    // Remote Turso over HTTP — no native module, ideal for serverless.
    const { createClient } = await import("@libsql/client/web");
    return createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  // Local embedded file.
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const { createClient } = await import("@libsql/client");
  return createClient({ url: `file:${FILE_PATH}` });
}

let _clientP: Promise<Client> | null = null;
let _migrated: Promise<void> | null = null;

function client(): Promise<Client> {
  if (!_clientP) _clientP = makeClient();
  return _clientP;
}

async function ready(): Promise<Client> {
  const c = await client();
  if (!_migrated) _migrated = migrate(c);
  await _migrated;
  return c;
}

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS accounts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     member_sub TEXT UNIQUE NOT NULL,
     author_urn TEXT NOT NULL,
     name TEXT, email TEXT, picture TEXT,
     access_token TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     scopes TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS posts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     commentary TEXT NOT NULL,
     visibility TEXT NOT NULL DEFAULT 'PUBLIC',
     status TEXT NOT NULL DEFAULT 'draft',
     scheduled_at INTEGER,
     published_at INTEGER,
     linkedin_urn TEXT,
     error TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, scheduled_at)`,
  `CREATE TABLE IF NOT EXISTS engagements (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     source_url TEXT,
     source_text TEXT,
     draft_comment TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS targets (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     url TEXT, name TEXT, context TEXT, draft TEXT, note TEXT,
     tags TEXT,
     priority INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'todo',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_targets_status ON targets(account_id, status)`,
  `CREATE TABLE IF NOT EXISTS voice_profiles (
     account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     samples TEXT,
     style_guide TEXT,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS analytics_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
     event TEXT NOT NULL,
     meta TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS browser_tasks (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   type TEXT NOT NULL,
   url TEXT NOT NULL,
   content TEXT,
   status TEXT NOT NULL DEFAULT 'pending',
   error TEXT,
   created_at INTEGER NOT NULL,
   updated_at INTEGER NOT NULL
 )`,
];

async function migrate(c: Client): Promise<void> {
  for (const stmt of DDL) {
    await c.execute(stmt);
  }
  // Backfill columns on databases created before these fields existed.
  await addColumnIfMissing(c, "targets", "tags", "TEXT");
  await addColumnIfMissing(c, "targets", "priority", "INTEGER NOT NULL DEFAULT 0");
}

async function addColumnIfMissing(c: Client, table: string, column: string, decl: string) {
  const res = await c.execute(`PRAGMA table_info(${table})`);
  if (!res.rows.some((r: any) => r.name === column)) {
    await c.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

// ── Low-level query helpers ───────────────────────────────────────────────────

async function all<T = any>(sql: string, args: InArgs = []): Promise<T[]> {
  const c = await ready();
  const res = await c.execute({ sql, args });
  return res.rows as unknown as T[];
}

async function one<T = any>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

async function run(
  sql: string,
  args: InArgs = []
): Promise<{ lastInsertRowid: number; rowsAffected: number }> {
  const c = await ready();
  const res = await c.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid != null ? Number(res.lastInsertRowid) : 0,
    rowsAffected: res.rowsAffected,
  };
}

/** Build a dynamic "col = ?" SET clause + ordered args from a fields object. */
function setClause(fields: Record<string, unknown>): { clause: string; args: any[] } {
  const keys = Object.keys(fields);
  return {
    clause: keys.map((k) => `${k} = ?`).join(", "),
    args: keys.map((k) => fields[k] as any),
  };
}

/** Initialize the database (used by the db:init script). */
export async function initDb(): Promise<void> {
  await ready();
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

export async function upsertAccount(input: {
  member_sub: string;
  author_urn: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  access_token: string;
  expires_at: number;
  scopes?: string | null;
}): Promise<Account> {
  const now = Date.now();
  await run(
    `INSERT INTO accounts
       (member_sub, author_urn, name, email, picture, access_token, expires_at, scopes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(member_sub) DO UPDATE SET
       author_urn   = excluded.author_urn,
       name         = excluded.name,
       email        = excluded.email,
       picture      = excluded.picture,
       access_token = excluded.access_token,
       expires_at   = excluded.expires_at,
       scopes       = excluded.scopes,
       updated_at   = excluded.updated_at`,
    [
      input.member_sub,
      input.author_urn,
      input.name ?? null,
      input.email ?? null,
      input.picture ?? null,
      input.access_token,
      input.expires_at,
      input.scopes ?? null,
      now,
      now,
    ]
  );
  return (await getAccountBySub(input.member_sub))!;
}

export function getAccountBySub(sub: string): Promise<Account | undefined> {
  return one<Account>("SELECT * FROM accounts WHERE member_sub = ?", [sub]);
}

export function getAccountById(id: number): Promise<Account | undefined> {
  return one<Account>("SELECT * FROM accounts WHERE id = ?", [id]);
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

export async function createPost(input: {
  account_id: number;
  commentary: string;
  visibility?: string;
  status?: string;
  scheduled_at?: number | null;
}): Promise<Post> {
  const now = Date.now();
  const { lastInsertRowid } = await run(
    `INSERT INTO posts (account_id, commentary, visibility, status, scheduled_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.account_id,
      input.commentary,
      input.visibility ?? "PUBLIC",
      input.status ?? "draft",
      input.scheduled_at ?? null,
      now,
      now,
    ]
  );
  return (await getPost(lastInsertRowid))!;
}

export function getPost(id: number): Promise<Post | undefined> {
  return one<Post>("SELECT * FROM posts WHERE id = ?", [id]);
}

export function listPosts(accountId: number): Promise<Post[]> {
  return all<Post>(
    "SELECT * FROM posts WHERE account_id = ? ORDER BY COALESCE(published_at, scheduled_at, created_at) DESC",
    [accountId]
  );
}

export function listDuePosts(now = Date.now()): Promise<Post[]> {
  return all<Post>(
    "SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC",
    [now]
  );
}

export async function updatePost(
  id: number,
  fields: Partial<
    Pick<
      Post,
      "commentary" | "visibility" | "status" | "scheduled_at" | "published_at" | "linkedin_urn" | "error"
    >
  >
): Promise<Post | undefined> {
  if (Object.keys(fields).length === 0) return getPost(id);
  const { clause, args } = setClause(fields);
  await run(`UPDATE posts SET ${clause}, updated_at = ? WHERE id = ?`, [...args, Date.now(), id]);
  return getPost(id);
}

export async function deletePost(id: number, accountId: number): Promise<void> {
  await run("DELETE FROM posts WHERE id = ? AND account_id = ?", [id, accountId]);
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

export async function createEngagement(input: {
  account_id: number;
  source_url?: string | null;
  source_text?: string | null;
  draft_comment: string;
}): Promise<Engagement> {
  const now = Date.now();
  const { lastInsertRowid } = await run(
    `INSERT INTO engagements (account_id, source_url, source_text, draft_comment, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [input.account_id, input.source_url ?? null, input.source_text ?? null, input.draft_comment, now, now]
  );
  return (await getEngagement(lastInsertRowid))!;
}

export function getEngagement(id: number): Promise<Engagement | undefined> {
  return one<Engagement>("SELECT * FROM engagements WHERE id = ?", [id]);
}

export function listEngagements(accountId: number): Promise<Engagement[]> {
  return all<Engagement>("SELECT * FROM engagements WHERE account_id = ? ORDER BY created_at DESC", [
    accountId,
  ]);
}

export async function updateEngagement(
  id: number,
  fields: Partial<Pick<Engagement, "draft_comment" | "status">>
): Promise<Engagement | undefined> {
  if (Object.keys(fields).length === 0) return getEngagement(id);
  const { clause, args } = setClause(fields);
  await run(`UPDATE engagements SET ${clause}, updated_at = ? WHERE id = ?`, [...args, Date.now(), id]);
  return getEngagement(id);
}

// ── Engagement target helpers ─────────────────────────────────────────────────

export interface Target {
  id: number;
  account_id: number;
  kind: string;
  url: string | null;
  name: string | null;
  context: string | null;
  draft: string | null;
  note: string | null;
  tags: string | null;
  priority: number;
  status: string;
  created_at: number;
  updated_at: number;
}

export async function createTarget(input: {
  account_id: number;
  kind: "post" | "person";
  url?: string | null;
  name?: string | null;
  context?: string | null;
  note?: string | null;
  tags?: string | null;
  priority?: number;
}): Promise<Target> {
  const now = Date.now();
  const { lastInsertRowid } = await run(
    `INSERT INTO targets (account_id, kind, url, name, context, note, tags, priority, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?)`,
    [
      input.account_id,
      input.kind,
      input.url ?? null,
      input.name ?? null,
      input.context ?? null,
      input.note ?? null,
      input.tags ?? null,
      input.priority ?? 0,
      now,
      now,
    ]
  );
  return (await getTarget(lastInsertRowid))!;
}

export function getTarget(id: number): Promise<Target | undefined> {
  return one<Target>("SELECT * FROM targets WHERE id = ?", [id]);
}

export function listTargets(accountId: number): Promise<Target[]> {
  return all<Target>(
    `SELECT * FROM targets WHERE account_id = ?
     ORDER BY
       CASE status WHEN 'todo' THEN 0 WHEN 'drafted' THEN 1 ELSE 2 END ASC,
       priority DESC,
       created_at DESC`,
    [accountId]
  );
}

export async function updateTarget(
  id: number,
  fields: Partial<
    Pick<Target, "url" | "name" | "context" | "draft" | "note" | "tags" | "priority" | "status">
  >
): Promise<Target | undefined> {
  if (Object.keys(fields).length === 0) return getTarget(id);
  const { clause, args } = setClause(fields);
  await run(`UPDATE targets SET ${clause}, updated_at = ? WHERE id = ?`, [...args, Date.now(), id]);
  return getTarget(id);
}

export async function deleteTarget(id: number, accountId: number): Promise<void> {
  await run("DELETE FROM targets WHERE id = ? AND account_id = ?", [id, accountId]);
}

/** Count targets marked done since local midnight (for the daily sprint goal). */
export async function countEngagedToday(accountId: number): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const row = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM targets WHERE account_id = ? AND status = 'done' AND updated_at >= ?",
    [accountId, start.getTime()]
  );
  return row?.n ?? 0;
}

// ── Voice profile helpers ─────────────────────────────────────────────────────

export interface VoiceProfile {
  account_id: number;
  samples: string | null;
  style_guide: string | null;
  updated_at: number;
}

export function getVoiceProfile(accountId: number): Promise<VoiceProfile | undefined> {
  return one<VoiceProfile>("SELECT * FROM voice_profiles WHERE account_id = ?", [accountId]);
}

export async function saveVoiceProfile(input: {
  account_id: number;
  samples?: string | null;
  style_guide?: string | null;
}): Promise<VoiceProfile> {
  const now = Date.now();
  await run(
    `INSERT INTO voice_profiles (account_id, samples, style_guide, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       samples     = COALESCE(excluded.samples, voice_profiles.samples),
       style_guide = COALESCE(excluded.style_guide, voice_profiles.style_guide),
       updated_at  = excluded.updated_at`,
    [input.account_id, input.samples ?? null, input.style_guide ?? null, now]
  );
  return (await getVoiceProfile(input.account_id))!;
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

export async function logEvent(accountId: number | null, event: string, meta?: unknown): Promise<void> {
  await run("INSERT INTO analytics_log (account_id, event, meta, created_at) VALUES (?, ?, ?, ?)", [
    accountId,
    event,
    meta ? JSON.stringify(meta) : null,
    Date.now(),
  ]);
}

export async function analyticsSummary(accountId: number) {
  const posts = await listPosts(accountId);
  const published = posts.filter((p) => p.status === "published");
  const scheduled = posts.filter((p) => p.status === "scheduled");
  const drafts = posts.filter((p) => p.status === "draft");

  const byWeek: Record<string, number> = {};
  for (const p of published) {
    if (!p.published_at) continue;
    const week = isoWeekKey(new Date(p.published_at));
    byWeek[week] = (byWeek[week] || 0) + 1;
  }

  const engagements = await listEngagements(accountId);

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

// ── Browser task helpers ──────────────────────────────────────────────────────

export interface BrowserTask {
  id: number;
  account_id: number;
  type: string;
  url: string;
  content: string | null;
  status: string;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export async function createBrowserTask(input: {
  account_id: number;
  type: string;
  url: string;
  content?: string | null;
}): Promise<BrowserTask> {
  const now = Date.now();
  const { lastInsertRowid } = await run(
    `INSERT INTO browser_tasks (account_id, type, url, content, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [input.account_id, input.type, input.url, input.content ?? null, now, now]
  );
  return (await getBrowserTask(lastInsertRowid))!;
}

export function getBrowserTask(id: number): Promise<BrowserTask | undefined> {
  return one<BrowserTask>("SELECT * FROM browser_tasks WHERE id = ?", [id]);
}

export function listPendingBrowserTasks(accountId: number): Promise<BrowserTask[]> {
  return all<BrowserTask>(
    "SELECT * FROM browser_tasks WHERE account_id = ? AND status = 'pending' ORDER BY created_at ASC",
    [accountId]
  );
}

export async function updateBrowserTask(
  id: number,
  fields: Partial<Pick<BrowserTask, "status" | "error">>
): Promise<BrowserTask | undefined> {
  if (Object.keys(fields).length === 0) return getBrowserTask(id);
  const { clause, args } = setClause(fields);
  await run(`UPDATE browser_tasks SET ${clause}, updated_at = ? WHERE id = ?`, [
    ...args,
    Date.now(),
    id,
  ]);
  return getBrowserTask(id);
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
