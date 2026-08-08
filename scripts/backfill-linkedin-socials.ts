/**
 * Ensure every user's LinkedIn raw_source has social URLs parsed into the KG,
 * then rebuild graphs so GitHub/Twitter/etc. auto-fill on forms.
 */
import fs from "fs";
import path from "path";
import { pool } from "../src/lib/db";
import { extractLinkedInSocials } from "../src/lib/linkedin-socials";
import { saveKnowledgeTabFields } from "../src/lib/profile-knowledge";
import { findUserProfile } from "../src/lib/knowledge-repos";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}

const EXTRA_SOCIAL_LINES: Record<string, string> = {
  // Faizan — LinkedIn headline lists GitHub Name
  faizan: `
LinkedIn: https://www.linkedin.com/in/faizanalvii
GitHub Name: alvi83252-dot
GitHub: https://github.com/alvi83252-dot
`,
  andrii: `
LinkedIn: https://www.linkedin.com/in/andrii-kontovskyi-267a24262
`,
};

function extraFor(name: string | null, email: string | null): string {
  const n = (name || "").toLowerCase();
  const e = (email || "").toLowerCase();
  if (n.includes("faizan") || e.includes("faizan") || e.includes("alvi")) {
    return EXTRA_SOCIAL_LINES.faizan;
  }
  if (n.includes("andrii") || n.includes("kontovsky") || e.includes("akontovskyi")) {
    return EXTRA_SOCIAL_LINES.andrii;
  }
  return "";
}

async function main() {
  loadEnv();
  const { rows } = await pool.query<{
    id: string;
    name: string | null;
    email: string | null;
  }>(`SELECT id, name, email FROM users`);

  for (const row of rows) {
    const profile = await findUserProfile(row.id);
    if (!profile?.rawSource || profile.rawSource.length < 40) {
      console.log(`skip ${row.name} — no LinkedIn source`);
      continue;
    }

    const extra = extraFor(row.name, row.email);
    let raw = profile.rawSource;
    if (extra && !/github\.com|GitHub Name:/i.test(raw)) {
      raw = `${extra.trim()}\n\n${raw}`;
      await pool.query(
        `UPDATE user_profiles SET raw_source = $2, updated_at = NOW() WHERE user_id = $1`,
        [row.id, raw]
      );
      await pool.query(`UPDATE users SET raw_source = $2 WHERE id = $1`, [
        row.id,
        raw,
      ]);
    }

    const socials = extractLinkedInSocials(raw);
    await pool.query(
      `UPDATE user_profiles
       SET linkedin_snapshot_json = $2::text, updated_at = NOW()
       WHERE user_id = $1`,
      [
        row.id,
        JSON.stringify({
          socials: {
            linkedin: socials.linkedin,
            github: socials.github,
            twitter: socials.twitter,
            instagram: socials.instagram,
            website: socials.website,
            portfolio: socials.portfolio,
          },
          updatedAt: new Date().toISOString(),
        }),
      ]
    );

    // Rebuild KG (includes HAS_GITHUB etc.) via knowledge tab save
    await saveKnowledgeTabFields({
      userId: row.id,
      name: row.name,
      age: profile.age,
      lifeStatus: profile.lifeStatus,
      placeOfWorkStudy: profile.placeOfWorkStudy,
      agentSummary: profile.agentSummary,
    });

    // Re-fetch raw after possible update for social rebuild — saveKnowledge uses profile.rawSource from DB
    // Force another rebuild with updated raw by touching via SQL already done; save used old rawSource from find before update.
    // Call save again after ensuring find sees new raw:
    const refreshed = await findUserProfile(row.id);
    if (refreshed) {
      await saveKnowledgeTabFields({
        userId: row.id,
        name: row.name,
        age: refreshed.age,
        lifeStatus: refreshed.lifeStatus,
        placeOfWorkStudy: refreshed.placeOfWorkStudy,
        agentSummary: refreshed.agentSummary,
      });
    }

    console.log(row.name, {
      linkedin: socials.linkedin,
      github: socials.github,
      twitter: socials.twitter,
      website: socials.website,
    });
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
