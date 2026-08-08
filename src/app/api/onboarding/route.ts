import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { findLumaConnection, findUserById, updateUser } from "@/lib/repos";
import { skillsToKeywords } from "@/lib/skills";
import {
  mergeAgent1WithSelections,
  runAgent1Profile,
} from "@/lib/agent1-profile";
import {
  EVENT_INTERESTS,
  EVENT_LOCATIONS,
  MAX_WRITING_SAMPLES,
  MIN_CHIP_PICKS,
  PROFILE_SKILLS,
} from "@/lib/profile-options";

const identitySchema = z.object({
  step: z.literal(2),
  registrationName: z.string().trim().min(1).max(120),
  registrationEmail: z.string().trim().email(),
});

const profileSchema = z.object({
  step: z.literal(4),
  locations: z.array(z.string()).min(MIN_CHIP_PICKS),
  interests: z.array(z.string()).min(MIN_CHIP_PICKS),
  skills: z.array(z.string()).min(MIN_CHIP_PICKS),
  rawSource: z.string().trim().optional().default(""),
  writingSamples: z
    .array(z.string().trim())
    .max(MAX_WRITING_SAMPLES)
    .optional(),
});

const bodySchema = z.union([identitySchema, profileSchema]);

function splitPipe(value: string | null | undefined): string[] {
  return value ? value.split("|").filter(Boolean) : [];
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await findUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const lumaConnection = await findLumaConnection(session.user.id);

  let writingSamples: string[] = [];
  try {
    writingSamples = JSON.parse(user.writingSamples || "[]") as string[];
  } catch {
    writingSamples = [];
  }

  let icsPreview: unknown[] = [];
  try {
    icsPreview = JSON.parse(lumaConnection?.previewJson || "[]");
  } catch {
    icsPreview = [];
  }

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    registrationName: user.registrationName || user.name || "",
    registrationEmail: user.registrationEmail || user.email || "",
    locations: splitPipe(user.location),
    skills: splitPipe(user.skills),
    interests: splitPipe(user.interests),
    rawSource: user.rawSource || "",
    writingSamples,
    onboardingCompleted: user.onboardingCompleted,
    onboardingStep: user.onboardingStep,
    hasLumaConnection: Boolean(lumaConnection),
    lumaStatus: lumaConnection?.status || null,
    icsPreview,
    catalogs: {
      locations: EVENT_LOCATIONS,
      interests: EVENT_INTERESTS,
      skills: PROFILE_SKILLS,
    },
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  if (parsed.data.step === 2) {
    const user = await updateUser(session.user.id, {
      registrationName: parsed.data.registrationName,
      registrationEmail: parsed.data.registrationEmail.toLowerCase(),
      name: parsed.data.registrationName,
      onboardingStep: 3,
    });

    return NextResponse.json({
      ok: true,
      onboardingStep: user.onboardingStep,
    });
  }

  const data = parsed.data;
  const allow = (list: string[], allowed: readonly string[]) =>
    Array.from(new Set(list)).filter((x) =>
      (allowed as readonly string[]).includes(x)
    );

  const locations = allow(data.locations, EVENT_LOCATIONS);
  const interests = allow(data.interests, EVENT_INTERESTS);
  const skills = allow(data.skills, PROFILE_SKILLS);

  if (!locations.length || !interests.length || !skills.length) {
    return NextResponse.json(
      {
        error:
          "Select at least one location, one interest, and one skill from the lists",
      },
      { status: 400 }
    );
  }

  const samples = (data.writingSamples || [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 20)
    .slice(0, MAX_WRITING_SAMPLES);

  const rawSource = (data.rawSource || "").trim();
  const agentInput = {
    locations,
    interests,
    skills,
    rawSource,
  };

  // Agent 1: NVIDIA GLM primary, OpenRouter fallback. On total failure, keep chips.
  let merged = {
    skills,
    techStack: [] as string[],
    interests,
    seniority: null as string | null,
    eventTypes: [] as string[],
    headline: null as string | null,
    bio: null as string | null,
    keywords: skillsToKeywords([...skills, ...interests, ...locations])
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  };
  let llmProvider: "nvidia" | "openrouter" | "none" = "none";

  // Only call the LLM when there's CV/profile text; chips alone are enough to finish.
  if (rawSource.length >= 40) {
    try {
      const { profile, provider } = await runAgent1Profile(agentInput);
      merged = mergeAgent1WithSelections(profile, agentInput);
      llmProvider = provider;
    } catch (err) {
      console.warn(
        "[onboarding] Agent 1 failed, saving selections only:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const user = await updateUser(session.user.id, {
    location: locations.join("|"),
    skills: merged.skills.join("|"),
    interests: merged.interests.join("|"),
    techStack: merged.techStack.join("|"),
    seniority: merged.seniority,
    eventTypes: merged.eventTypes.join("|"),
    headline: merged.headline,
    bio: merged.bio,
    rawSource,
    writingSamples: JSON.stringify(samples),
    agentKeywords: merged.keywords.join(","),
    onboardingStep: 4,
    onboardingCompleted: true,
  });

  return NextResponse.json({
    ok: true,
    onboardingCompleted: user.onboardingCompleted,
    onboardingStep: user.onboardingStep,
    agent1Provider: llmProvider,
  });
}
