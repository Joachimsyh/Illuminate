import { z } from "zod";
import { llmChat, LlmError } from "@/lib/llm";
import {
  EVENT_INTERESTS,
  PROFILE_SKILLS,
  SENIORITY_OPTIONS,
  TECH_STACK,
} from "@/lib/profile-options";

const extractedSchema = z.object({
  skills: z.array(z.string()).default([]),
  tech_stack: z.array(z.string()).default([]),
  interests: z.array(z.string()).default([]),
  seniority: z.string().nullable().optional(),
  event_preferences: z.array(z.string()).default([]),
  headline: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  keywords: z.array(z.string()).default([]),
});

export type Agent1Profile = z.infer<typeof extractedSchema>;

export type Agent1Input = {
  locations: string[];
  interests: string[];
  skills: string[];
  rawSource: string;
};

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() || text.trim();
  // Strip leading junk before first {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Agent 1 — Profile Builder.
 * Primary: NVIDIA NIM (z-ai/glm-5.2). Fallback: OpenRouter.
 */
export async function runAgent1Profile(
  input: Agent1Input
): Promise<{ profile: Agent1Profile; provider: "nvidia" | "openrouter" }> {
  const system = `You are Agent 1 for Illuminate — a profile builder for Luma event matching.
Extract a structured professional profile from the user's selections and pasted CV / LinkedIn text.

Rules:
- Return ONLY valid JSON (no markdown, no commentary).
- Prefer the user's explicit selections when they conflict with the text.
- skills: short role labels. Prefer values from: ${PROFILE_SKILLS.join(", ")}. You may add close synonyms if clearly supported by the CV.
- tech_stack: concrete tools/languages. Prefer: ${TECH_STACK.join(", ")}.
- interests: event topics. Prefer: ${EVENT_INTERESTS.join(", ")}.
- seniority: one of ${SENIORITY_OPTIONS.join(" | ")} or null.
- event_preferences: short phrases for event types they would like (hackathons, meetups, etc.).
- keywords: 5–15 lowercase keywords useful for matching Luma event titles/descriptions.
- Do not invent employers, degrees, or skills not supported by the text or selections.
- headline: one short line if inferable, else null.
- bio: 1–2 sentence summary if inferable, else null.

JSON shape:
{
  "skills": string[],
  "tech_stack": string[],
  "interests": string[],
  "seniority": string | null,
  "event_preferences": string[],
  "headline": string | null,
  "bio": string | null,
  "keywords": string[]
}`;

  const user = `Selected locations: ${input.locations.join(", ") || "(none)"}
Selected interests: ${input.interests.join(", ") || "(none)"}
Selected skills: ${input.skills.join(", ") || "(none)"}

Pasted CV / LinkedIn profile text:
---
${input.rawSource.slice(0, 12000)}
---`;

  const { content, provider } = await llmChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    maxTokens: 2048,
    topP: 1,
    seed: 42,
    responseFormat: { type: "json_object" },
  });

  let parsed: unknown;
  try {
    parsed = parseJsonObject(content);
  } catch {
    throw new LlmError("Agent 1 returned non-JSON output", provider);
  }

  return { profile: extractedSchema.parse(parsed), provider };
}

/** Merge LLM output with user chip selections (user chips win as baseline). */
export function mergeAgent1WithSelections(
  extracted: Agent1Profile,
  input: Agent1Input
): {
  skills: string[];
  techStack: string[];
  interests: string[];
  seniority: string | null;
  eventTypes: string[];
  headline: string | null;
  bio: string | null;
  keywords: string[];
} {
  const uniq = (xs: string[]) =>
    Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));

  const skills = uniq([...input.skills, ...extracted.skills]);
  const interests = uniq([...input.interests, ...extracted.interests]);
  const techStack = uniq(extracted.tech_stack);
  const eventTypes = uniq(extracted.event_preferences);
  const keywords = uniq([
    ...extracted.keywords,
    ...input.locations,
    ...interests,
    ...skills,
  ]).map((k) => k.toLowerCase());

  const seniority =
    extracted.seniority &&
    (SENIORITY_OPTIONS as readonly string[]).includes(extracted.seniority)
      ? extracted.seniority
      : extracted.seniority?.trim() || null;

  return {
    skills,
    techStack,
    interests,
    seniority,
    eventTypes,
    headline: extracted.headline?.trim() || null,
    bio: extracted.bio?.trim() || null,
    keywords,
  };
}

export { LlmError };
