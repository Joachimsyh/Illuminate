import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { fetchAndParseLumaIcs, isValidLumaIcsUrl } from "@/lib/luma-ics";

export const runtime = "nodejs";

const bodySchema = z.object({
  icsUrl: z.string().url(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ICS URL" }, { status: 400 });
  }

  const icsUrl = parsed.data.icsUrl.trim();
  if (!isValidLumaIcsUrl(icsUrl)) {
    return NextResponse.json(
      {
        error:
          "Link must match https://api.luma.com/ics/get?entity=user&id=icssk-…",
      },
      { status: 400 }
    );
  }

  try {
    const result = await fetchAndParseLumaIcs(icsUrl);
    if (!result.ok) {
      console.warn("[ics] validate failed:", result.error);
      return NextResponse.json(
        { error: result.error || "Could not parse calendar", events: [] },
        { status: 422 }
      );
    }

    await prisma.lumaConnection.upsert({
      where: { userId: session.user.id },
      update: {
        icsUrlEncrypted: encryptSecret(icsUrl),
        icsUrlLastOkAt: new Date(),
        status: "active",
        previewJson: JSON.stringify(result.events.slice(0, 20)),
      },
      create: {
        userId: session.user.id,
        icsUrlEncrypted: encryptSecret(icsUrl),
        icsUrlLastOkAt: new Date(),
        status: "active",
        previewJson: JSON.stringify(result.events.slice(0, 20)),
      },
    });

    await prisma.user.update({
      where: { id: session.user.id },
      data: { onboardingStep: 3 },
    });

    return NextResponse.json({
      ok: true,
      events: result.events,
      count: result.events.length,
    });
  } catch (err) {
    console.error("[ics] unexpected error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not save calendar connection",
      },
      { status: 500 }
    );
  }
}
