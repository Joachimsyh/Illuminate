/**
 * Background agent worker — checks matching events hourly and auto-applies.
 *
 * Usage:
 *   npm run agent
 *
 * Or schedule with cron:
 *   0 * * * * cd /path/to/illuminate && npm run agent
 */

import { runAgentCycle } from "../src/lib/agent";

const INTERVAL_MS = Number(process.env.AGENT_INTERVAL_MS || 60 * 60 * 1000);
const once = process.argv.includes("--once");

async function tick() {
  const started = new Date().toISOString();
  console.log(`[agent] cycle start ${started}`);
  try {
    const result = await runAgentCycle({
      onProgress: (e) => {
        console.log(`[agent] ${e.phase}: ${e.message}`);
      },
    });
    console.log(
      `[agent] users=${result.usersProcessed} attempted=${result.applicationsAttempted} ok=${result.successes} fail=${result.failures}`
    );
    for (const d of result.details) {
      console.log(
        `  - ${d.eventTitle || d.eventId}: ${d.status} — ${d.message}`
      );
    }
  } catch (err) {
    console.error("[agent] cycle failed", err);
  }
}

async function main() {
  await tick();
  if (once) {
    process.exit(0);
  }
  console.log(`[agent] scheduling every ${INTERVAL_MS / 1000 / 60} minutes`);
  setInterval(tick, INTERVAL_MS);
}

main();
