/**
 * Docker / local entrypoint:
 * 1. Wait for Postgres
 * 2. Apply sql/schema.sql (CREATE IF NOT EXISTS)
 * 3. Start the app command
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
const SKIP = process.env.SKIP_DB_MIGRATE === "true";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForDb(retries = 30) {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const connectionString = DATABASE_URL.replace(
    /[?&]schema=[^&]*/g,
    ""
  ).replace(/\?$/, "");

  for (let i = 0; i < retries; i++) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      console.log("[entrypoint] database is ready");
      return;
    } catch (err) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      console.log(
        `[entrypoint] waiting for db (${i + 1}/${retries}):`,
        err.message
      );
      await sleep(2000);
    }
  }
  throw new Error("database did not become ready in time");
}

async function applySchema() {
  if (SKIP) {
    console.log("[entrypoint] SKIP_DB_MIGRATE=true — skipping schema apply");
    return;
  }
  const schemaPath = path.join(process.cwd(), "sql", "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.warn("[entrypoint] sql/schema.sql not found — skipping");
    return;
  }
  const sql = fs.readFileSync(schemaPath, "utf8");
  const connectionString = DATABASE_URL.replace(
    /[?&]schema=[^&]*/g,
    ""
  ).replace(/\?$/, "");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("[entrypoint] applying sql/schema.sql");
    await client.query(sql);
    console.log("[entrypoint] schema applied");
  } finally {
    await client.end();
  }
}

function runCommand(argv) {
  const child = spawn(argv[0], argv.slice(1), {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

(async () => {
  await waitForDb();
  await applySchema();
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("[entrypoint] no command provided");
    process.exit(1);
  }
  runCommand(args);
})().catch((err) => {
  console.error("[entrypoint] failed:", err);
  process.exit(1);
});
