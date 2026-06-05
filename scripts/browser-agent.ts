/**
 * Local Playwright browser agent for LinkedIn automation.
 *
 * Setup:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 *   Add to .env.local:
 *     AGENT_API_KEY=some-random-secret   # must match the value on the server
 *
 *   Then run:
 *     AGENT_API_KEY=some-random-secret LGS_ACCOUNT_ID=1 npm run browser-agent
 *
 * The agent polls the web app for pending browser tasks (likes, comments) and
 * executes them in a real Chromium window so LinkedIn sees normal browser traffic.
 * A persistent profile keeps you logged in between runs.
 */

import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
const AGENT_KEY = process.env.AGENT_API_KEY || "";
const ACCOUNT_ID = process.env.LGS_ACCOUNT_ID || "1";
const PROFILE_DIR = process.env.BROWSER_PROFILE || path.join(os.homedir(), ".lgs-browser");
const POLL_MS = 5_000;

async function main() {
  if (!AGENT_KEY) {
    console.error(
      "AGENT_API_KEY is not set.\n" +
        "Set it to the same value as AGENT_API_KEY on the server, then rerun:\n" +
        "  AGENT_API_KEY=<secret> LGS_ACCOUNT_ID=<id> npm run browser-agent"
    );
    process.exit(1);
  }

  console.log("LinkedIn Browser Agent");
  console.log(`  App URL   : ${BASE_URL}`);
  console.log(`  Account   : ${ACCOUNT_ID}`);
  console.log(`  Profile   : ${PROFILE_DIR}`);
  console.log();

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = await ctx.newPage();
  await page.goto("https://www.linkedin.com/feed/");
  await page.waitForTimeout(2000);

  const loginNeeded =
    page.url().includes("/login") ||
    page.url().includes("/checkpoint") ||
    page.url().includes("/uas/");

  if (loginNeeded) {
    console.log("Not logged in to LinkedIn. Sign in in the browser window, then restart.");
    await page.waitForURL("**/feed/**", { timeout: 120_000 });
    console.log("Logged in.\n");
  } else {
    console.log("Already logged in to LinkedIn.\n");
  }

  console.log(`Polling for tasks every ${POLL_MS / 1000}s…\n`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await poll(page);
    await sleep(POLL_MS);
  }
}

async function poll(page: any) {
  try {
    const res = await fetch(`${BASE_URL}/api/browser-tasks`, {
      headers: { "x-agent-key": AGENT_KEY, "x-account-id": ACCOUNT_ID },
    });
    if (!res.ok) {
      console.warn(`Poll HTTP ${res.status}`);
      return;
    }
    const { tasks } = (await res.json()) as { tasks: any[] };
    for (const task of tasks) {
      await executeTask(page, task);
    }
  } catch (e: any) {
    if (!e.message?.includes("ECONNREFUSED")) console.error("Poll error:", e.message);
  }
}

async function executeTask(page: any, task: any) {
  console.log(`Task #${task.id} [${task.type}]: ${task.url}`);
  await patchTask(task.id, "running");
  try {
    if (task.type === "like") await likePost(page, task.url);
    else if (task.type === "comment") await commentPost(page, task.url, task.content);
    else throw new Error(`Unknown task type: ${task.type}`);
    await patchTask(task.id, "done");
    console.log("  ✓ done");
  } catch (e: any) {
    console.error("  ✗ failed:", e.message);
    await patchTask(task.id, "failed", e.message);
  }
}

async function likePost(page: any, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Try several selectors — LinkedIn's DOM updates periodically
  const selectors = [
    'button[aria-label*="Like"][data-urn]',
    'button.react-button__trigger',
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
  throw new Error("Like button not found — LinkedIn may have updated its DOM");
}

async function commentPost(page: any, url: string, text: string) {
  if (!text) throw new Error("No comment text provided");

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Open the comment box
  const commentTriggers = [
    'button[aria-label*="comment"]',
    'button.comment-button',
    '[data-control-name="comment"]',
  ];
  for (const sel of commentTriggers) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      await btn.click({ timeout: 5000 });
      break;
    }
  }
  await page.waitForTimeout(1000);

  // Find the editable comment field
  const inputSelectors = [
    '.ql-editor[contenteditable="true"]',
    '[data-placeholder*="comment"]',
    'div[contenteditable="true"]',
  ];
  let typed = false;
  for (const sel of inputSelectors) {
    const inp = page.locator(sel).first();
    if ((await inp.count()) > 0) {
      await inp.click();
      await inp.type(text, { delay: 25 });
      typed = true;
      break;
    }
  }
  if (!typed) throw new Error("Comment input not found");
  await page.waitForTimeout(500);

  // Submit
  const submitSelectors = [
    "button.comments-comment-box__submit-button",
    'button[aria-label*="Post comment"]',
    'button[type="submit"]',
  ];
  for (const sel of submitSelectors) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      await btn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      return;
    }
  }
  throw new Error("Submit button not found");
}

async function patchTask(id: number, status: string, error?: string) {
  try {
    await fetch(`${BASE_URL}/api/browser-tasks/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-agent-key": AGENT_KEY,
        "x-account-id": ACCOUNT_ID,
      },
      body: JSON.stringify({ status, error: error ?? null }),
    });
  } catch {
    // Ignore reporting failures — main task outcome already logged
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
