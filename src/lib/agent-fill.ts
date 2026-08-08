import { z } from "zod";
import { llmChat, LlmError } from "@/lib/llm";
import type { FormField } from "@/lib/luma-scraper";
import {
  extractLinkedInSocials,
  formatSocialsForAgent,
  type LinkedInSocials,
} from "@/lib/linkedin-socials";

export type ProfileForFill = {
  name: string | null;
  email: string | null;
  company: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  skills: string;
  techStack: string;
  interests: string;
  seniority: string | null;
  rawSource: string;
  writingSamples: string;
  linkedinId: string | null;
  agentSummary?: string | null;
  placeOfWorkStudy?: string | null;
  lifeStatus?: string | null;
  socials?: LinkedInSocials | null;
};

function socialsFor(user: ProfileForFill): LinkedInSocials {
  if (user.socials) return user.socials;
  return extractLinkedInSocials(user.rawSource || "", {
    linkedinFallback: user.linkedinId
      ? null
      : extractLinkedInSocials(`${user.bio || ""}\n${user.rawSource || ""}`)
          .linkedin,
  });
}

function pickSocial(
  label: string,
  key: string,
  socials: LinkedInSocials
): string | null {
  const hay = `${label} ${key}`.toLowerCase();

  if (hay.includes("linkedin")) return socials.linkedin;
  if (hay.includes("github") || hay.includes("git hub") || hay === "gh") {
    // Luma "GitHub username" fields want the handle, not the URL
    if (hay.includes("username") || hay.includes("handle")) {
      const m = socials.github?.match(/github\.com\/([^/\s]+)/i);
      return m?.[1] || socials.github;
    }
    return socials.github;
  }
  if (
    hay.includes("twitter") ||
    hay.includes(" x ") ||
    hay.startsWith("x ") ||
    hay.endsWith(" x") ||
    hay === "x" ||
    key === "x" ||
    key === "twitter"
  ) {
    if (hay.includes("username") || hay.includes("handle")) {
      const m = (socials.twitter || socials.x)?.match(
        /(?:twitter\.com|x\.com)\/([^/\s]+)/i
      );
      return m?.[1] || socials.twitter || socials.x;
    }
    return socials.twitter || socials.x;
  }
  if (hay.includes("instagram") || hay.includes("ig "))
    return socials.instagram;
  if (hay.includes("youtube") || hay.includes("yt ")) return socials.youtube;
  if (hay.includes("medium")) return socials.medium;
  if (
    hay.includes("portfolio") ||
    hay.includes("personal site") ||
    hay.includes("personal website") ||
    hay.includes("website") ||
    hay.includes("homepage") ||
    (hay.includes("url") && !hay.includes("linkedin") && !hay.includes("github"))
  )
    return socials.portfolio || socials.website;

  return null;
}

/**
 * Deterministic fills from LinkedIn-derived profile + socials.
 * Every mappable field is filled here before the LLM sees leftovers.
 */
export function buildProfileAnswers(
  fields: FormField[],
  user: ProfileForFill,
  overrides: Record<string, string> = {}
): Record<string, string> {
  const answers: Record<string, string> = { ...overrides };
  const skills = user.skills || user.techStack || "";
  const interests = user.interests || "";
  const socials = socialsFor(user);
  const summary =
    user.agentSummary ||
    user.bio ||
    `I'm ${user.name || "a builder"} focused on ${
      interests || skills || "technology"
    }.`;

  for (const field of fields) {
    const key = field.name || field.id;
    if (answers[key]?.trim()) continue;

    const label = field.label.toLowerCase();
    const type = (field.type || "").toLowerCase();
    const social = pickSocial(label, key, socials);
    if (social) {
      answers[key] = social;
      continue;
    }

    if (type === "email" || label.includes("email")) {
      answers[key] = user.email || "";
      continue;
    }
    if (
      label.includes("full name") ||
      label === "name" ||
      key === "name" ||
      key === "full_name" ||
      (label.includes("name") &&
        !label.includes("company") &&
        !label.includes("user") &&
        !label.includes("github") &&
        !label.includes("twitter"))
    ) {
      answers[key] = user.name || "";
      continue;
    }
    if (
      label.includes("company") ||
      label.includes("organization") ||
      label.includes("employer") ||
      label.includes("workplace")
    ) {
      answers[key] =
        user.company ||
        user.placeOfWorkStudy?.split("·")[1]?.trim() ||
        user.placeOfWorkStudy ||
        "Independent";
      continue;
    }
    if (
      label.includes("school") ||
      label.includes("university") ||
      label.includes("college") ||
      label.includes("education")
    ) {
      answers[key] =
        user.placeOfWorkStudy?.split("·")[0]?.trim() ||
        user.placeOfWorkStudy ||
        "";
      continue;
    }
    if (
      label.includes("title") ||
      label.includes("role") ||
      label.includes("headline") ||
      label.includes("job") ||
      label.includes("occupation")
    ) {
      answers[key] = user.headline || user.seniority || user.lifeStatus || "";
      continue;
    }
    if (label.includes("seniority") || label.includes("level")) {
      answers[key] = user.seniority || user.lifeStatus || "Student";
      continue;
    }
    if (
      label.includes("skill") ||
      label.includes("tech") ||
      label.includes("stack") ||
      label.includes("expertise") ||
      label.includes("languages")
    ) {
      answers[key] = skills || user.headline || "";
      continue;
    }
    if (
      label.includes("interest") ||
      label.includes("topic") ||
      label.includes("focus")
    ) {
      answers[key] = interests || skills || "";
      continue;
    }
    if (
      label.includes("city") ||
      label.includes("location") ||
      label.includes("based") ||
      label.includes("where do you") ||
      label.includes("country")
    ) {
      answers[key] = (user.location || "").split("|")[0] || "London";
      continue;
    }
    if (
      label.includes("about you") ||
      label.includes("about me") ||
      label.includes("bio") ||
      label.includes("tell us about") ||
      label.includes("introduce yourself") ||
      label.includes("short description") ||
      label.includes("elevator")
    ) {
      answers[key] = summary;
      continue;
    }
    if (
      label.includes("why") ||
      label.includes("motivat") ||
      label.includes("what brings") ||
      label.includes("hope to") ||
      label.includes("expect") ||
      label.includes("looking for") ||
      type.includes("textarea") ||
      type.includes("long")
    ) {
      answers[key] = `${summary}\n\nI'd like to attend this event to meet builders and keep shipping.`;
      continue;
    }
    if (
      label.includes("phone") ||
      label.includes("mobile") ||
      label.includes("whatsapp")
    ) {
      // Never invent phone numbers — LinkedIn rarely has them publicly
      continue;
    }
    if (field.options?.length) {
      const hay = `${interests} ${skills} ${user.lifeStatus || ""} ${
        user.seniority || ""
      }`.toLowerCase();
      const match = field.options.find((o) =>
        hay.includes(o.toLowerCase().slice(0, 12))
      );
      answers[key] = match || field.options[0];
      continue;
    }
  }

  return answers;
}

const llmAnswersSchema = z.object({
  answers: z.array(
    z.object({
      id: z.string(),
      answer: z.string(),
    })
  ),
});

/**
 * Fill every remaining blank from LinkedIn knowledge — required or optional.
 */
export async function fillBlanksWithAgent(input: {
  fields: FormField[];
  existing: Record<string, string>;
  user: ProfileForFill;
  eventTitle: string;
  eventDescription?: string;
  knowledgeText?: string;
}): Promise<Record<string, string>> {
  const unanswered = input.fields.filter((f) => {
    const key = f.name || f.id;
    return !input.existing[key]?.trim();
  });

  if (!unanswered.length) return { ...input.existing };

  const socials = socialsFor(input.user);
  const socialBlock = formatSocialsForAgent(socials);

  const writingSamples = (() => {
    try {
      const parsed = JSON.parse(input.user.writingSamples || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 3).join("\n---\n") : "";
    } catch {
      return "";
    }
  })();

  const knowledgeBlock = input.knowledgeText
    ? `\nPRIMARY SOURCE — knowledge graph (LinkedIn-derived):\n${input.knowledgeText.slice(0, 5500)}\n`
    : "";

  const system = `You fill EVERY blank on a Luma registration form for Illuminate using the applicant's LinkedIn-derived knowledge graph and social links.

Answer ONLY with JSON: {"answers":[{"id":"...","answer":"..."}]}

HARD RULES:
- Fill EVERY question listed. Do not skip optional fields if LinkedIn/knowledge has a plausible answer.
- Social fields (GitHub, Twitter/X, LinkedIn, Instagram, Website, Portfolio, YouTube): use EXACT URLs from the Social links block. Never invent handles or URLs.
- If a social link is listed as missing, leave that answer as "" (empty string) — do not invent.
- Long-text / why-attend / about-you: first person, grounded in Agent summary + LinkedIn facts.
- Prefer knowledge graph edges (HAS_SKILL, USES_TECH, INTERESTED_IN, BASED_IN, Place of work/study).
- Do not invent phone numbers, employers, schools, or social URLs.
- Match dropdown options exactly when provided.
- Sound like the applicant.`;

  const userMsg = `Event: ${input.eventTitle}
${input.eventDescription ? `About: ${input.eventDescription.slice(0, 1200)}` : ""}
${knowledgeBlock}
Social links extracted from LinkedIn (authoritative — copy exactly):
${socialBlock}

Contact / profile:
- Name: ${input.user.name || ""}
- Email: ${input.user.email || ""}
- Headline: ${input.user.headline || ""}
- Company: ${input.user.company || ""}
- Place: ${input.user.placeOfWorkStudy || ""}
- Status: ${input.user.lifeStatus || ""}
- Location: ${input.user.location || ""}
- Seniority: ${input.user.seniority || ""}
- Skills: ${input.user.skills || ""}
- Tech stack: ${input.user.techStack || ""}
- Interests: ${input.user.interests || ""}
- Agent summary: ${(input.user.agentSummary || input.user.bio || "").slice(0, 1200)}
- LinkedIn / CV excerpt: ${(input.user.rawSource || "").slice(0, 3500)}
${writingSamples ? `- Writing samples:\n${writingSamples.slice(0, 800)}` : ""}

Questions to answer (use each id exactly — answer ALL of them):
${unanswered
  .map((f) => {
    const opts = f.options?.length ? ` options=${JSON.stringify(f.options)}` : "";
    return `- id=${f.name || f.id} | type=${f.type} | required=${Boolean(f.required)} | label=${f.label}${opts}`;
  })
  .join("\n")}`;

  try {
    const { content } = await llmChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      temperature: 0.25,
      maxTokens: 2000,
      responseFormat: { type: "json_object" },
    });

    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    const raw =
      jsonStart >= 0 && jsonEnd > jsonStart
        ? content.slice(jsonStart, jsonEnd + 1)
        : content;
    const parsed = llmAnswersSchema.parse(JSON.parse(raw));
    const next = { ...input.existing };
    for (const row of parsed.answers) {
      if (row.id && row.answer?.trim()) next[row.id] = row.answer.trim();
    }

    // Second-pass deterministic social fill in case LLM left them blank
    for (const field of unanswered) {
      const key = field.name || field.id;
      if (next[key]?.trim()) continue;
      const social = pickSocial(field.label, key, socials);
      if (social) next[key] = social;
    }
    return next;
  } catch (err) {
    console.warn(
      "[agent-fill] LLM fill failed, using LinkedIn heuristics:",
      err instanceof LlmError ? err.message : err
    );
    const next = { ...input.existing };
    for (const field of unanswered) {
      const key = field.name || field.id;
      if (next[key]?.trim()) continue;
      const social = pickSocial(field.label, key, socials);
      if (social) {
        next[key] = social;
        continue;
      }
      if (
        (field.label || "").toLowerCase().includes("phone") ||
        (field.label || "").toLowerCase().includes("mobile")
      ) {
        continue;
      }
      next[key] =
        input.user.agentSummary ||
        input.user.bio ||
        `I'm ${input.user.name || "a builder"} focused on ${
          input.user.interests || input.user.skills || "technology and community"
        }. Excited to join ${input.eventTitle}.`;
    }
    return next;
  }
}
