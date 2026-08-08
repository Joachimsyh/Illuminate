import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { findUserById } from "@/lib/repos";
import { findUserProfile, listProfilePosts } from "@/lib/knowledge-repos";
import { syncUserProfileKnowledge } from "@/lib/profile-knowledge";
import {
  EVENT_INTERESTS,
  EVENT_LOCATIONS,
  PROFILE_SKILLS,
} from "@/lib/profile-options";

export const runtime = "nodejs";

function splitPipe(value: string | null | undefined): string[] {
  return value ? value.split("|").filter(Boolean) : [];
}

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const updateSchema = z.object({
  locations: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  rawSource: z.string().optional(),
  writingSamples: z.array(z.string()).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await findUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const stored = await findUserProfile(session.user.id);
  const posts = await listProfilePosts(session.user.id);

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    locations: splitPipe(user.location),
    interests: splitPipe(user.interests),
    skills: splitPipe(user.skills),
    rawSource: stored?.rawSource || user.rawSource || "",
    writingSamples: posts.map((p) => p.content),
    profileCached: Boolean(stored?.extractedAt),
    extractedAt: stored?.extractedAt || null,
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

  const existing = await findUserById(session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const stored = await findUserProfile(session.user.id);
  const existingPosts = await listProfilePosts(session.user.id);

  const nextLocations = locations ?? splitPipe(existing.location);
  const nextInterests = interests ?? splitPipe(existing.interests);
  const nextSkills = skills ?? splitPipe(existing.skills);
  const nextRaw = rawSource ?? stored?.rawSource ?? existing.rawSource ?? "";
  const nextSamples =
    parsed.data.writingSamples?.map((s) => s.trim()).filter(Boolean) ??
    existingPosts.map((p) => p.content);

  const sync = await syncUserProfileKnowledge({
    userId: session.user.id,
    name: existing.name,
    company: existing.company,
    locations: nextLocations,
    interests: nextInterests,
    skills: nextSkills,
    rawSource: nextRaw,
    writingSamples: nextSamples,
  });

  return NextResponse.json({
    ok: true,
    locations: parseJsonArray(sync.profile.locationsJson),
    interests: parseJsonArray(sync.profile.interestsJson),
    skills: parseJsonArray(sync.profile.skillsJson),
    rawSource: sync.profile.rawSource || "",
    profileCached: sync.reused,
    newPosts: sync.newPosts,
    agent1Provider: sync.provider,
  });
}
