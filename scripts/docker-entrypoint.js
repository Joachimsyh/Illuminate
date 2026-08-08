#!/usr/bin/env node
/**
 * Container entrypoint:
 * 1. Wait for DATABASE_URL to accept connections
 * 2. prisma db push (hackathon-friendly; use migrate deploy in stricter envs)
 * 3. exec the main process (web or agent)
 */

const { spawn, spawnSync } = require("child_process");
const { setTimeout: sleep } = require("timers/promises");

const databaseUrl = process.env.DATABASE_URL;
const skipMigrate = process.env.SKIP_DB_MIGRATE === "true";
const maxAttempts = Number(process.env.DB_WAIT_ATTEMPTS || 30);

async function waitForDb() {
  if (!databaseUrl || skipMigrate) return;

  for (let i = 1; i <= maxAttempts; i += 1) {
    const result = spawnSync(
      "node",
      [
        "-e",
        `
        const { PrismaClient } = require('@prisma/client');
        const p = new PrismaClient();
        p.$connect()
          .then(() => p.$disconnect())
          .then(() => process.exit(0))
          .catch(() => process.exit(1));
        `,
      ],
      { stdio: "ignore", env: process.env }
    );

    if (result.status === 0) {
      console.log(`[entrypoint] database ready (attempt ${i})`);
      return;
    }

    console.log(`[entrypoint] waiting for database… (${i}/${maxAttempts})`);
    await sleep(2000);
  }

  console.error("[entrypoint] database not reachable — continuing anyway");
}

function migrate() {
  if (skipMigrate) {
    console.log("[entrypoint] SKIP_DB_MIGRATE=true — skipping prisma db push");
    return;
  }

  console.log("[entrypoint] running prisma db push");
  const result = spawnSync(
    "node",
    ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
    {
      stdio: "inherit",
      env: process.env,
    }
  );

  if (result.status !== 0) {
    console.error("[entrypoint] prisma db push failed");
    process.exit(result.status || 1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("[entrypoint] no command provided");
    process.exit(1);
  }

  await waitForDb();
  migrate();

  console.log(`[entrypoint] starting: ${args.join(" ")}`);
  const child = spawn(args[0], args.slice(1), {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  const forward = (signal) => {
    if (child.pid) child.kill(signal);
  };
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error("[entrypoint] fatal", err);
  process.exit(1);
});
