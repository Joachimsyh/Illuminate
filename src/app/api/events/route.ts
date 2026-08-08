import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findUserById } from "@/lib/repos";
import { discoverEventsForProfile } from "@/lib/luma-scraper";

export const runtime = "nodejs";

function splitPipe(value: string | null | undefined): string[] {
  return value ? value.split("|").filter(Boolean) : [];
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  const mode = refresh ? "all" : searchParams.get("mode") === "all" ? "all" : "match";

  try {
    const user = await findUserById(session.user.id);

    const locations = splitPipe(user?.location);
    const interests = splitPipe(user?.interests);

    const result = await discoverEventsForProfile({
      locations,
      interests,
      limit: mode === "all" ? 100 : 10,
      mode,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error || "Failed to fetch Luma events",
          attempts: result.attempts,
          commands: result.attempts.map((a) => a.command),
          events: [],
          count: 0,
          locations,
          interests,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      events: result.events,
      count: result.events.length,
      locations,
      interests,
      attempts: result.attempts,
      warning: result.error || null,
      added: result.added ?? 0,
      skipped: result.skipped ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to discover events",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
