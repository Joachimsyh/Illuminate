import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { skillsToKeywords } from "@/lib/skills";
import {
  mergeAgent1WithSelections,
  runAgent1Profile,
} from "@/lib/agent1-profile";
import {
  EVENT_INTERESTS,
  EVENT_LOCATIONS,
  PROFILE_SKILLS,
} from "@/lib/profile-options";

export const runtime = "nodejs";

function splitPipe(value: string | null | undefined): string[] {
  return value ? value.split("|").filter(Boolean) : [];
}

const updateSchema = z.object({
  locations: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  rawSource: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    locations: splitPipe(user.location),
    interests: splitPipe(user.interests),
    skills: splitPipe(user.skills),
    rawSource: user.rawSource || "",
    catalogs: {
      locations: EVENT_LOCATIONS,
      interests: EVENT_INTERESTS,
      skills: PROFILE_SKILLS,
    },
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const allow = (list: string[] | undefined, allowed: readonly string[]) =>
    list
      ? Array.from(new Set(list)).filter((x) =>
          (allowed as readonly string[]).includes(x)
        )
      : undefined;

  const locations = allow(parsed.data.locations, EVENT_LOCATIONS);
  const interests = allow(parsed.data.interests, EVENT_INTERESTS);
  const skills = allow(parsed.data.skills, PROFILE_SKILLS);
  const rawSource =
    typeof parsed.data.rawSource === "string"
      ? parsed.data.rawSource.trim()
      : undefined;

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const nextLocations = locations ?? splitPipe(existing.location);
  const nextInterests = interests ?? splitPipe(existing.interests);
  const nextSkills = skills ?? splitPipe(existing.skills);
  const nextRaw = rawSource ?? existing.rawSource ?? "";

  let techStack = existing.techStack || "";
  let seniority = existing.seniority;
  let eventTypes = existing.eventTypes || "";
  let headline = existing.headline;
  let bio = existing.bio;
  let agentKeywords = skillsToKeywords([
    ...nextSkills,
    ...nextInterests,
    ...nextLocations,
  ]);

  if (nextRaw.length >= 40) {
    try {
      const { profile } = await runAgent1Profile({
        locations: nextLocations,
        interests: nextInterests,
        skills: nextSkills,
        rawSource: nextRaw,
      });
      const merged = mergeAgent1WithSelections(profile, {
        locations: nextLocations,
        interests: nextInterests,
        skills: nextSkills,
        rawSource: nextRaw,
      });
      techStack = merged.techStack.join("|");
      seniority = merged.seniority;
      eventTypes = merged.eventTypes.join("|");
      headline = merged.headline || headline;
      bio = merged.bio || bio;
      agentKeywords = merged.keywords.join(",");
    } catch (err) {
      console.warn(
        "[profile] Agent 1 failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      location: nextLocations.join("|"),
      interests: nextInterests.join("|"),
      skills: nextSkills.join("|"),
      rawSource: nextRaw,
      techStack,
      seniority,
      eventTypes,
      headline,
      bio,
      agentKeywords,
    },
  });

  return NextResponse.json({
    ok: true,
    locations: splitPipe(user.location),
    interests: splitPipe(user.interests),
    skills: splitPipe(user.skills),
    rawSource: user.rawSource || "",
  });
}
