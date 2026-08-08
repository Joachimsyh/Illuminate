import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { autoApply } from "@/lib/auto-apply";

export const runtime = "nodejs";
/** Browser assist can wait several minutes for captcha. */
export const maxDuration = 300;

const bodySchema = z.object({
  eventId: z.string().min(1),
  answers: z.record(z.string()).optional(),
  browserAssist: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "eventId is required", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await autoApply({
      userId: session.user.id,
      eventId: parsed.data.eventId,
      answers: parsed.data.answers,
      browserAssist: parsed.data.browserAssist === true,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 422,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Apply failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
