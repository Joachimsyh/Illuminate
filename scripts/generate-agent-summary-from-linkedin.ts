/**
 * One-shot: load LinkedIn profile text → Agent 1 → user_profiles for Faizan.
 * Usage: npx tsx scripts/generate-agent-summary-from-linkedin.ts
 */
import fs from "fs";
import path from "path";
import { syncUserProfileKnowledge } from "../src/lib/profile-knowledge";
import { updateUser } from "../src/lib/repos";
import { pool } from "../src/lib/db";

const USER_ID = "2985322d-525e-4b18-ad93-c8fe87dd2530";
const PROFILE_PATH = path.join(process.cwd(), "tmp-linkedin-faizan.txt");

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function extractWritingSamples(full: string): string[] {
  const samples: string[] = [];
  const blocks = full.split(/\n- \[\d{4}-\d{2}-\d{2}/);
  for (const block of blocks) {
    const quoted = block.match(/> ([\s\S]*?)(?=\n- \[|\n## |\n### |$)/);
    if (!quoted) continue;
    const text = quoted[1]
      .split("\n")
      .map((l) => l.replace(/^>\s?/, "").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text.length >= 80) samples.push(text.slice(0, 2500));
    if (samples.length >= 5) break;
  }
  return samples;
}

async function main() {
  loadEnvFiles();
  if (!fs.existsSync(PROFILE_PATH)) {
    throw new Error(`Missing ${PROFILE_PATH}`);
  }

  const full = fs.readFileSync(PROFILE_PATH, "utf8");
  // Prefer About + Experience-ish sections for Agent 1 (cap handled inside agent)
  const cutoff = full.indexOf("\n## Social");
  const rawSource = (
    cutoff > 0 ? full.slice(0, cutoff) : full
  ).trim();

  const writingSamples = extractWritingSamples(full);

  // Enrich with explicit LinkedIn facts from public profile headline
  const enriched = `LinkedIn: https://www.linkedin.com/in/faizanalvii
Name: Faizan Alvi
Headline: CS Student at Brunel / Traveler / Photographer / Aiming to be in the cybersecurity industry / cybersecurity intern at xFacility Group
Location: United Kingdom
GitHub: alvi83252-dot

${rawSource}`;

  console.log(
    `Syncing profile (${enriched.length} chars source, ${writingSamples.length} posts)…`
  );

  const result = await syncUserProfileKnowledge({
    userId: USER_ID,
    name: "Faizan Alvi",
    company: "xFacility Group",
    locations: ["London", "United Kingdom"],
    interests: ["AI", "Hackathons", "Cybersecurity", "Agents"],
    skills: [
      "Full-Stack Development",
      "AI / ML",
      "Cybersecurity",
      "Software Engineering",
    ],
    rawSource: enriched,
    writingSamples,
    forceExtract: true,
  });

  await updateUser(USER_ID, {
    name: "Faizan Alvi",
    company: "xFacility Group",
    headline:
      result.profile.headline ||
      "CS Student at Brunel · Cybersecurity intern · AI builder",
  });

  console.log(
    JSON.stringify(
      {
        extracted: result.extracted,
        provider: result.provider,
        newPosts: result.newPosts,
        headline: result.profile.headline,
        lifeStatus: result.profile.lifeStatus,
        placeOfWorkStudy: result.profile.placeOfWorkStudy,
        age: result.profile.age,
        agentSummary: result.profile.agentSummary,
        bio: result.profile.bio,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
