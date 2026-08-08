import { z } from "zod";
import { llmChat, LlmError } from "@/lib/llm";
import type { FormField } from "@/lib/luma-scraper";

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
};

/**
 * Deterministic fills from registration/profile identity.
 */
export function buildProfileAnswers(
  fields: FormField[],
  user: ProfileForFill,
  overrides: Record<string, string> = {}
): Record<string, string> {
  const answers: Record<string, string> = { ...overrides };
  const skills = user.skills || user.techStack || "";
  const interests = user.interests || "";

  for (const field of fields) {
    const key = field.name || field.id;
    if (answers[key]?.trim()) continue;

    const label = field.label.toLowerCase();
    const type = (field.type || "").toLowerCase();

    if (type === "email" || label.includes("email")) {
      answers[key] = user.email || "";
      continue;
    }
    if (
      label.includes("full name") ||
      label === "name" ||
      key === "name" ||
      key === "full_name" ||
      (label.includes("name") && !label.includes("company") && !label.includes("user"))
    ) {
      answers[key] = user.name || "";
      continue;
    }
    if (label.includes("company") || label.includes("organization") || label.includes("employer")) {
      answers[key] = user.company || "Independent";
      continue;
    }
    if (label.includes("linkedin")) {
      answers[key] = user.linkedinId
        ? `https://www.linkedin.com/in/${user.linkedinId}`
        : "";
      continue;
    }
    if (
      label.includes("title") ||
      label.includes("role") ||
      label.includes("headline") ||
      label.includes("job")
    ) {
      answers[key] = user.headline || user.seniority || "Builder";
      continue;
    }
    if (label.includes("seniority") || label.includes("level")) {
      answers[key] = user.seniority || "Mid";
      continue;
    }
    if (
      label.includes("skill") ||
      label.includes("tech") ||
      label.includes("stack") ||
      label.includes("expertise")
    ) {
      answers[key] = skills || user.headline || "Software / AI";
      continue;
    }
    if (
      label.includes("interest") ||
      label.includes("topic") ||
      label.includes("focus")
    ) {
      answers[key] = interests || skills || "AI, startups, community";
      continue;
    }
    if (
      label.includes("city") ||
      label.includes("location") ||
      label.includes("based") ||
      label.includes("where")
    ) {
      answers[key] = user.location || "London";
      continue;
    }
    if (
      label.includes("phone") ||
      label.includes("mobile") ||
      label.includes("whatsapp")
    ) {
      // Don't invent phone numbers
      continue;
    }
    if (field.options?.length) {
      // Prefer an option that matches interests/skills; else first option
      const hay = `${interests} ${skills}`.toLowerCase();
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
 * Use the LLM to draft answers for remaining open registration questions
 * from the user's onboarding/profile data.
 */
export async function fillBlanksWithAgent(input: {
  fields: FormField[];
  existing: Record<string, string>;
  user: ProfileForFill;
  eventTitle: string;
  eventDescription?: string;
}): Promise<Record<string, string>> {
  const unanswered = input.fields.filter((f) => {
    const key = f.name || f.id;
    return !input.existing[key]?.trim();
  });

  if (!unanswered.length) return { ...input.existing };

  const writingSamples = (() => {
    try {
      const parsed = JSON.parse(input.user.writingSamples || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 3).join("\n---\n") : "";
    } catch {
      return "";
    }
  })();

  const system = `You fill Luma event registration forms for Illuminate.
Answer ONLY with JSON: {"answers":[{"id":"...","answer":"..."}]}
Rules:
- Sound like the applicant, first person, concise (1–4 sentences for long-text).
- Use ONLY facts from the profile. Do not invent employers, schools, or phone numbers.
- If a question cannot be answered from the profile, write a short honest fit statement from skills/interests.
- Match dropdown/select options exactly when options are provided.
- Never leave an answer empty for required fields.`;

  const userMsg = `Event: ${input.eventTitle}
${input.eventDescription ? `About: ${input.eventDescription.slice(0, 1200)}` : ""}

Applicant profile:
- Name: ${input.user.name || ""}
- Email: ${input.user.email || ""}
- Headline: ${input.user.headline || ""}
- Company: ${input.user.company || ""}
- Location: ${input.user.location || ""}
- Seniority: ${input.user.seniority || ""}
- Skills: ${input.user.skills || ""}
- Tech stack: ${input.user.techStack || ""}
- Interests: ${input.user.interests || ""}
- Bio: ${(input.user.bio || "").slice(0, 800)}
- CV excerpt: ${(input.user.rawSource || "").slice(0, 2500)}
${writingSamples ? `- Writing samples:\n${writingSamples.slice(0, 1000)}` : ""}

Questions to answer (use each id exactly):
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
      temperature: 0.35,
      maxTokens: 1200,
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
    return next;
  } catch (err) {
    console.warn(
      "[agent-fill] LLM fill failed, using heuristics:",
      err instanceof LlmError ? err.message : err
    );
    // Heuristic fallback for leftover required open fields
    const next = { ...input.existing };
    for (const field of unanswered) {
      const key = field.name || field.id;
      if (next[key]?.trim()) continue;
      if (!field.required && !(field.type || "").includes("text")) continue;
      next[key] =
        input.user.bio ||
        `I'm ${input.user.name || "a builder"} focused on ${
          input.user.interests || input.user.skills || "technology and community"
        }. Excited to join ${input.eventTitle}.`;
    }
    return next;
  }
}
