import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { findUserById } from "@/lib/repos";
import { findUserProfile } from "@/lib/knowledge-repos";
import { saveKnowledgeTabFields } from "@/lib/profile-knowledge";
import { LIFE_STATUS_OPTIONS } from "@/lib/profile-options";

export const runtime = "nodejs";

const patchSchema = z.object({
  age: z.number().int().min(13).max(100).nullable().optional(),
  lifeStatus: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) =>
        v == null ||
        v === "" ||
        (LIFE_STATUS_OPTIONS as readonly string[]).includes(v),
      { message: "Invalid status" }
    ),
  placeOfWorkStudy: z.string().max(200).nullable().optional(),
  agentSummary: z.string().max(4000).nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await findUserProfile(session.user.id);
  return NextResponse.json({
    age: profile?.age ?? null,
    lifeStatus: profile?.lifeStatus ?? null,
    placeOfWorkStudy: profile?.placeOfWorkStudy ?? null,
    agentSummary: profile?.agentSummary ?? profile?.bio ?? null,
    headline: profile?.headline ?? null,
    updatedAt: profile?.updatedAt ?? null,
    statusOptions: LIFE_STATUS_OPTIONS,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const user = await findUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await findUserProfile(session.user.id);
  const age =
    "age" in parsed.data ? (parsed.data.age ?? null) : (existing?.age ?? null);
  const lifeStatus =
    "lifeStatus" in parsed.data
      ? parsed.data.lifeStatus?.trim() || null
      : existing?.lifeStatus || null;
  const placeOfWorkStudy =
    "placeOfWorkStudy" in parsed.data
      ? parsed.data.placeOfWorkStudy?.trim() || null
      : existing?.placeOfWorkStudy || null;
  const agentSummary =
    "agentSummary" in parsed.data
      ? parsed.data.agentSummary?.trim() || null
      : existing?.agentSummary || null;

  const profile = await saveKnowledgeTabFields({
    userId: session.user.id,
    name: user.name,
    age,
    lifeStatus,
    placeOfWorkStudy,
    agentSummary,
  });

  return NextResponse.json({
    ok: true,
    age: profile.age,
    lifeStatus: profile.lifeStatus,
    placeOfWorkStudy: profile.placeOfWorkStudy,
    agentSummary: profile.agentSummary,
    updatedAt: profile.updatedAt,
  });
}
