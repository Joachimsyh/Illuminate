import { NextResponse } from "next/server";
import { scrapeOrFallback } from "@/lib/luma-scraper";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const event = await scrapeOrFallback(params.id);
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to scrape event",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 404 }
    );
  }
}
