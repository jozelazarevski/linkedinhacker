// ─────────────────────────────────────────────────────────────────────────────
// Background scheduler worker.
//
// Polls the database for scheduled posts whose time has arrived and publishes
// them via the official LinkedIn Posts API. Run alongside the web app:
//
//   npm run worker
//
// Configure the poll interval with WORKER_INTERVAL_MS (default 60000 = 1 min).
// ─────────────────────────────────────────────────────────────────────────────

import { runDuePosts } from "../lib/publisher";

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS || 60_000);

async function tick() {
  try {
    const result = await runDuePosts();
    if (result.attempted > 0) {
      console.log(
        `[worker ${new Date().toISOString()}] attempted=${result.attempted} published=${result.published} failed=${result.failed}`
      );
    }
  } catch (err) {
    console.error(`[worker ${new Date().toISOString()}] error:`, err);
  }
}

console.log(`LinkedIn Growth Studio worker started (interval=${INTERVAL}ms). Press Ctrl+C to stop.`);
void tick();
setInterval(() => void tick(), INTERVAL);
