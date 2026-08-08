import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALL_SKILLS, MAX_SKILLS, MIN_SKILLS, skillsToKeywords } from "@/lib/skills";

const bodySchema = z.object({
  skills: z
    .array(z.string())
    .min(MIN_SKILLS, `Pick at least ${MIN_SKILLS} interests`)
    .max(MAX_SKILLS, `Pick at most ${MAX_SKILLS} interests`),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      skills: true,
      onboardingCompleted: true,
      name: true,
    },
  });

  return NextResponse.json({
    skills: user?.skills ? user.skills.split("|").filter(Boolean) : [],
    onboardingCompleted: user?.onboardingCompleted ?? false,
    name: user?.name,
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
      { error: parsed.error.issues[0]?.message || "Invalid skills" },
      { status: 400 }
    );
  }

  const allowed = new Set(ALL_SKILLS);
  const skills = Array.from(new Set(parsed.data.skills)).filter((s) =>
    allowed.has(s)
  );

  if (skills.length < MIN_SKILLS) {
    return NextResponse.json(
      { error: `Pick at least ${MIN_SKILLS} interests from the list` },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      skills: skills.join("|"),
      agentKeywords: skillsToKeywords(skills),
      onboardingCompleted: true,
    },
    select: {
      skills: true,
      onboardingCompleted: true,
      agentKeywords: true,
    },
  });

  return NextResponse.json({
    ok: true,
    skills: user.skills.split("|").filter(Boolean),
    onboardingCompleted: user.onboardingCompleted,
    agentKeywords: user.agentKeywords,
  });
}
