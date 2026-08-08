/**
 * Regenerate first-person agent summaries for every user with LinkedIn/CV source.
 * Usage: npx tsx scripts/regenerate-all-agent-summaries.ts
 */
import fs from "fs";
import path from "path";
import { pool } from "../src/lib/db";
import { llmChat } from "../src/lib/llm";
import {
  saveKnowledgeTabFields,
  syncUserProfileKnowledge,
} from "../src/lib/profile-knowledge";
import { updateUser } from "../src/lib/repos";
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

const SEEDS: Record<
  string,
  {
    name: string;
    company?: string;
    locations: string[];
    interests: string[];
    skills: string[];
    rawSource: string;
    writingSamples?: string[];
  }
> = {
  andrii: {
    name: "Andrii Kontovskyi",
    locations: ["London", "United Kingdom"],
    interests: ["AI", "Cybersecurity", "Hackathons", "Agents"],
    skills: [
      "Software Engineering",
      "AI / ML",
      "Cybersecurity",
      "Full-Stack Development",
    ],
    rawSource: `LinkedIn: https://www.linkedin.com/in/andrii-kontovskyi-267a24262
Name: Andrii Kontovskyi
Headline: Student at Brunel University, studying and looking forward to specialise on Cybersecurity and Artificial Intelligence
Location: London, England, United Kingdom

About:
Student at Brunel University, studying and looking forward to specialise on Cybersecurity and Artificial Intelligence.

Education:
Bachelor's degree, Artificial Intelligence — Brunel University of London (2024–2028), Uxbridge, Middlesex, United Kingdom.

Experience:
IT Consultant (Консультант з інформаційних технологій) — The Ukrainian Welcome Centre.

Projects & hackathons (with Brunel peers):
- Intelligent Appointment Recovery (IAR) — multi-agent healthcare scheduling prototype (Google / CopilotKit / A2A hackathon, London) with teammates including Faizan Alvi.
- Corroba / Corroba.dev — GTM Hackathon London build (Cursor / GTMengineer / Lightfern) with Faizan Alvi, Oleksandra Denysenko, Yu Hang Joachim Sin, Anjila Gurung.
- ManertDev — Cursor Cybersecurity London Hackathon teammate with Faizan Alvi (secure development layer to reduce secret leaks).
- Active London AI / agent hackathon participant; reflects on back-to-back hackathon season.

Focus: Artificial Intelligence degree track with strong interest in cybersecurity; builds agentic and full-stack prototypes under hackathon pressure.`,
    writingSamples: [
      `Finally, after this crazy month of competing in Hackathons back to back, I have some time to take a break and actually reflect on things I've done. Today is hot as well, so don't forget to Hydrate!`,
      `Have you ever tried to book an appointment and they schedule it in 4 months? But what if it's urgent, and it could become critical in a week? That's why we built Intelligent Appointment Recovery (IAR) — a multi-agent healthcare operations prototype to coordinate GP appointments, recover lost capacity, and prioritise urgent patients.`,
    ],
  },
};

function parseJsonList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function matchSeed(name: string | null, email: string | null) {
  const n = (name || "").toLowerCase();
  const e = (email || "").toLowerCase();
  if (n.includes("kontovsky") || e.includes("akontovskyi") || n.includes("andrii")) {
    return SEEDS.andrii;
  }
  return null;
}

async function polishFirstPerson(input: {
  name: string;
  rawSource: string;
  draft: string | null;
}): Promise<string> {
  const { content } = await llmChat({
    messages: [
      {
        role: "system",
        content: `You write Illuminate agent summaries.
Return ONLY plain text (no markdown, no quotes).
Write 5–7 sentences in FIRST PERSON (I / I'm / I've / My).
Be specific and descriptive: university or employer, focus areas, 2–3 named projects/hackathons if present, tech strengths, and what Luma events fit.
Ground ONLY in the LinkedIn/CV text and draft. Do not invent employers or awards.
Never use third person.`,
      },
      {
        role: "user",
        content: `Name: ${input.name}

LinkedIn / CV:
---
${input.rawSource.slice(0, 12000)}
---

Draft (may be third person — rewrite in first person if needed):
${input.draft || "(none)"}`,
      },
    ],
    temperature: 0.35,
    maxTokens: 700,
  });
  return content.trim().replace(/^["']|["']$/g, "");
}

async function main() {
  loadEnv();

  const users = await pool.query<{
    id: string;
    name: string | null;
    email: string | null;
    company: string | null;
    location: string | null;
    skills: string | null;
    interests: string | null;
    raw_source: string;
  }>(
    `SELECT id, name, email, company, location, skills, interests, raw_source FROM users ORDER BY created_at`
  );

  for (const row of users.rows) {
    const existing = await findUserProfile(row.id);
    const seed = matchSeed(row.name, row.email);

    let rawSource = (existing?.rawSource || row.raw_source || "").trim();
    if (rawSource.length < 80 && seed) rawSource = seed.rawSource;
    if (rawSource.length < 80) {
      console.log(
        `skip ${row.name} (${row.id.slice(0, 8)}) — no LinkedIn/CV source`
      );
      continue;
    }

    const displayName = seed?.name || row.name || "User";
    const locations =
      parseJsonList(existing?.locationsJson).length > 0
        ? parseJsonList(existing?.locationsJson)
        : seed?.locations ||
          (row.location || "")
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean);
    const interests =
      parseJsonList(existing?.interestsJson).length > 0
        ? parseJsonList(existing?.interestsJson)
        : seed?.interests ||
          (row.interests || "")
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean);
    const skills =
      parseJsonList(existing?.skillsJson).length > 0
        ? parseJsonList(existing?.skillsJson)
        : seed?.skills ||
          (row.skills || "")
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean);

    console.log(`\n→ Regenerating ${displayName}…`);

    const result = await syncUserProfileKnowledge({
      userId: row.id,
      name: displayName,
      company: seed?.company || row.company || existing?.company || null,
      locations: locations.length ? locations : ["London", "United Kingdom"],
      interests: interests.length
        ? interests
        : ["AI", "Hackathons", "Cybersecurity"],
      skills: skills.length
        ? skills
        : ["Software Engineering", "AI / ML", "Full-Stack Development"],
      rawSource,
      writingSamples: seed?.writingSamples || [],
      forceExtract: true,
    });

    const summary = await polishFirstPerson({
      name: displayName,
      rawSource,
      draft: result.profile.agentSummary || result.profile.bio,
    });

    const profile = await saveKnowledgeTabFields({
      userId: row.id,
      name: displayName,
      age: result.profile.age,
      lifeStatus: result.profile.lifeStatus || "Student",
      placeOfWorkStudy:
        result.profile.placeOfWorkStudy ||
        (seed?.name?.includes("Andrii")
          ? "Brunel University of London · Ukrainian Welcome Centre"
          : result.profile.placeOfWorkStudy),
      agentSummary: summary,
    });

    await updateUser(row.id, {
      name: displayName,
      bio: summary,
      ...(seed?.company ? { company: seed.company } : {}),
    });

    console.log({
      name: displayName,
      provider: result.provider,
      lifeStatus: profile.lifeStatus,
      place: profile.placeOfWorkStudy,
      summary,
    });
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
