import { NextResponse } from "next/server";
import { discoverEvents } from "@/lib/luma-scraper";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || undefined;

  try {
    const events = await discoverEvents(q);
    return NextResponse.json({ events, count: events.length });
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
