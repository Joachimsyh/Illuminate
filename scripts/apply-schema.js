/**
 * Apply sql/schema.sql to DATABASE_URL (local setup helper).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL first, e.g.");
    console.error(
      '  $env:DATABASE_URL="postgresql://luma:luma@localhost:5433/luma_autoapply"'
    );
    process.exit(1);
  }
  const connectionString = url
    .replace(/[?&]schema=[^&]*/g, "")
    .replace(/\?$/, "");
  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Schema applied to", connectionString.replace(/:[^:@]+@/, ":***@"));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
