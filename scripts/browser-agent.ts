/**
 * LinkedIn Browser Agent — two modes:
 *
 *   COLLECT mode  (run once to populate the queue)
 *     npm run browser-agent -- --collect [N]
 *     Scrolls your LinkedIn feed, extracts up to N posts (default 50)
 *     with their full text, and sends them to the app for AI drafting.
 *
 *   EXECUTE mode  (default — runs continuously)
 *     npm run browser-agent
 *     Polls the app for approved comments/likes and posts them at a
 *     human pace (randomised delays between each action).
 *
 * Setup:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 *   Add to .env.local (server) and export locally before running:
 *     AGENT_API_KEY=some-random-secret
 *     LGS_ACCOUNT_ID=1            # your numeric account id
 *     COMMENT_DELAY_MIN=45000     # ms, default 45 s
 *     COMMENT_DELAY_MAX=120000    # ms, default 2 min
 */

import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL   = process.env.NEXT_PUBLIC_URL     || "http://localhost:3000";
const AGENT_KEY  = process.env.AGENT_API_KEY        || "";
const ACCOUNT_ID = process.env.LGS_ACCOUNT_ID       || "1";
const PROFILE_DIR = process.env.BROWSER_PROFILE     || path.join(os.homedir(), ".lgs-browser");
const POLL_MS    = 10_000;

// Human-paced delays between posted comments (ms)
const DELAY_MIN  = Number(process.env.COMMENT_DELAY_MIN  || 45_000);
const DELAY_MAX  = Number(process.env.COMMENT_DELAY_MAX  || 120_000);

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE: "collect" | "execute" = args.includes("--collect") ? "collect" : "execute";
const COLLECT_LIMIT = Number(args.find((a) => /^\d+$/.test(a)) || 50);

async function main() {
  if (!AGENT_KEY) {
    console.error(
      "AGENT_API_KEY is not set.\n" +
      "Export it and re-run: AGENT_API_KEY=<secret> LGS_ACCOUNT_ID=<id> npm run browser-agent"
    );
    process.exit(1);
  }

  console.log(`LinkedIn Browser Agent  [${MODE.toUpperCase()} mode]`);
  console.log(`  App URL    : ${BASE_URL}`);
  console.log(`  Account    : ${ACCOUNT_ID}`);
  console.log(`  Profile    : ${PROFILE_DIR}`);
  if (MODE === "collect") console.log(`  Collect up : ${COLLECT_LIMIT} posts`);
  if (MODE === "execute") {
    console.log(`  Delay range: ${DELAY_MIN / 1000}s – ${DELAY_MAX / 1000}s between comments`);
  }
  console.log();

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = await ctx.newPage();

  // Ensure logged in to LinkedIn
  await page.goto("https://www.linkedin.com/feed/");
  await page.waitForTimeout(2500);

  const loginNeeded =
    page.url().includes("/login") ||
    page.url().includes("/checkpoint") ||
    page.url().includes("/uas/");

  if (loginNeeded) {
    console.log("Not logged in. Sign in in the browser window, then this script will continue.");
    await page.waitForURL("**/feed/**", { timeout: 180_000 });
    console.log("Logged in.\n");
  } else {
    console.log("Already logged in to LinkedIn.\n");
  }

  if (MODE === "collect") {
    await runCollect(page, COLLECT_LIMIT);
    await ctx.close();
  } else {
    console.log(`Polling for tasks every ${POLL_MS / 1000}s…\n`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await runExecute(page);
      await sleep(POLL_MS);
    }
  }
}

// ── COLLECT: scroll feed, extract posts, send to app ─────────────────────────

interface FeedPost {
  url: string;
  text: string;
}

async function runCollect(page: any, limit: number) {
  console.log(`Collecting up to ${limit} posts from your LinkedIn feed…\n`);

  const seen = new Set<string>();
  const posts: FeedPost[] = [];

  // Scroll in rounds until we have enough or stop finding new posts
  for (let round = 0; round < 20 && posts.length < limit; round++) {
    // Extract all currently visible posts
    const extracted: FeedPost[] = await page.evaluate(() => {
      const results: { url: string; text: string }[] = [];

      // LinkedIn wraps each feed item in a container with data-urn
      const containers = document.querySelectorAll<HTMLElement>(
        "[data-urn]"
      );

      for (const el of containers) {
        const urn = el.getAttribute("data-urn") || "";
        // Only activity / share URNs are posts
        if (!urn.includes("activity") && !urn.includes("share")) continue;

        const url = `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/`;

        // Try multiple selectors for post text (LinkedIn changes these)
        const textSelectors = [
          ".feed-shared-text",
          ".attributed-text-segment-wrap__content",
          ".feed-shared-update-v2__description .break-words",
          ".update-components-text span[dir]",
          '[data-test-id="main-feed-activity-card__commentary"]',
        ];
        let text = "";
        for (const sel of textSelectors) {
          const node = el.querySelector(sel);
          if (node?.textContent?.trim()) {
            text = node.textContent.trim();
            break;
          }
        }

        if (text && text.length > 30) {
          results.push({ url, text: text.slice(0, 1500) });
        }
      }
      return results;
    });

    let newThisRound = 0;
    for (const p of extracted) {
      if (!seen.has(p.url)) {
        seen.add(p.url);
        posts.push(p);
        newThisRound++;
        if (posts.length >= limit) break;
      }
    }

    console.log(
      `  Round ${round + 1}: found ${newThisRound} new posts (total ${posts.length})`
    );

    if (newThisRound === 0) {
      console.log("  No new posts in this scroll — feed end reached.");
      break;
    }

    if (posts.length >= limit) break;

    // Scroll down slowly (human-like)
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.85));
    await sleep(2000 + Math.random() * 2000);
  }

  if (posts.length === 0) {
    console.error("No posts found. Make sure you are logged into LinkedIn.");
    return;
  }

  console.log(`\nSending ${posts.length} posts to ${BASE_URL}…`);

  try {
    const res = await agentFetch("/api/targets/bulk", {
      method: "POST",
      body: JSON.stringify({ posts: posts.map((p) => ({ url: p.url, text: p.text })) }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Server error:", data.error);
    } else {
      console.log(
        `Done. Created ${data.created} new targets` +
          (data.skipped ? `, skipped ${data.skipped} already known.` : ".")
      );
      console.log("\nNext: open the app → 📋 Batch Engage → Draft → Review & Execute.");
    }
  } catch (e: any) {
    console.error("Failed to send posts to app:", e.message);
  }
}

// ── EXECUTE: poll for tasks and post them with human-paced delays ─────────────

async function runExecute(page: any) {
  try {
    const res = await agentFetch("/api/browser-tasks");
    if (!res.ok) {
      console.warn(`Poll HTTP ${res.status}`);
      return;
    }
    const { tasks } = (await res.json()) as { tasks: any[] };
    for (const task of tasks) {
      await executeTask(page, task);
      if (tasks.indexOf(task) < tasks.length - 1) {
        // Human-paced delay between actions
        const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
        console.log(`  Waiting ${Math.round(delay / 1000)}s before next action…`);
        await sleep(delay);
      }
    }
  } catch (e: any) {
    if (!e.message?.includes("ECONNREFUSED")) console.error("Poll error:", e.message);
  }
}

async function executeTask(page: any, task: any) {
  console.log(`Task #${task.id} [${task.type}]: ${task.url}`);
  await patchTask(task.id, "running");
  try {
    if (task.type === "like")         await likePost(page, task.url);
    else if (task.type === "comment") await commentPost(page, task.url, task.content);
    else throw new Error(`Unknown task type: ${task.type}`);
    await patchTask(task.id, "done");
    console.log("  ✓ done");
  } catch (e: any) {
    console.error("  ✗ failed:", e.message);
    await patchTask(task.id, "failed", e.message);
  }
}

// ── LinkedIn actions ──────────────────────────────────────────────────────────

async function likePost(page: any, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const selectors = [
    'button[aria-label*="Like"][data-urn]',
    "button.react-button__trigger",
    'button[aria-label^="Like"]',
    '[data-control-name="react"]',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      await btn.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      return;
    }
  }
  throw new Error("Like button not found");
}

async function commentPost(page: any, url: string, text: string) {
  if (!text) throw new Error("No comment text provided");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Click "Comment" button to open the input
  for (const sel of [
    'button[aria-label*="comment"]',
    "button.comment-button",
    '[data-control-name="comment"]',
  ]) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      await btn.click({ timeout: 5000 });
      break;
    }
  }
  await page.waitForTimeout(1000);

  // Find the comment editor
  let typed = false;
  for (const sel of [
    '.ql-editor[contenteditable="true"]',
    '[data-placeholder*="comment"]',
    'div[contenteditable="true"]',
  ]) {
    const inp = page.locator(sel).first();
    if ((await inp.count()) > 0) {
      await inp.click();
      // Type with human-like keystroke timing
      await inp.type(text, { delay: 30 + Math.random() * 40 });
      typed = true;
      break;
    }
  }
  if (!typed) throw new Error("Comment input not found");
  await page.waitForTimeout(500 + Math.random() * 500);

  // Submit
  for (const sel of [
    "button.comments-comment-box__submit-button",
    'button[aria-label*="Post comment"]',
    'button[type="submit"]',
  ]) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      await btn.click({ timeout: 5000 });
      await page.waitForTimeout(2500);
      return;
    }
  }
  throw new Error("Submit button not found");
}

// ── API helpers ───────────────────────────────────────────────────────────────

function agentFetch(path: string, init: RequestInit = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-agent-key": AGENT_KEY,
      "x-account-id": ACCOUNT_ID,
      ...((init.headers as Record<string, string>) || {}),
    },
  });
}

async function patchTask(id: number, status: string, error?: string) {
  try {
    await agentFetch(`/api/browser-tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, error: error ?? null }),
    });
  } catch {
    // Ignore — task outcome already logged locally
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
