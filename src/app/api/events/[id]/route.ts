import { NextResponse } from "next/server";
import {
  fetchAndStoreEventDetails,
  scrapeLumaEventDetailPage,
} from "@/lib/luma-event-details";
import { findEventBySlug, findEventDetailBySlug } from "@/lib/repos";

/**
 * GET /api/events/{slug}
 * slug = Luma path id (e.g. tldraw-vp8y), not the DB uuid.
 * Returns stored event_details (scraped from https://luma.com/{slug}),
 * fetching and caching if missing.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const slug = decodeURIComponent(params.id || "")
    .replace(/^\/+/, "")
    .split("?")[0]
    .split("/")[0];

  if (!slug) {
    return NextResponse.json({ error: "Missing event slug" }, { status: 400 });
  }

  const force =
    new URL(request.url).searchParams.get("refresh") === "1" ||
    new URL(request.url).searchParams.get("force") === "1";

  try {
    const listing = await findEventBySlug(slug);

    if (listing) {
      const stored = force ? null : await findEventDetailBySlug(slug);
      if (!stored || force) {
        const result = await fetchAndStoreEventDetails(slug, { force: true });
        if (!result.ok) {
          return NextResponse.json(
            { error: "Failed to scrape event details", message: result.error },
            { status: 502 }
          );
        }
      }
      const detail = await findEventDetailBySlug(slug);
      return NextResponse.json({
        slug,
        event: listing,
        details: detail,
        source: "database",
      });
    }

    // Not in events table yet — scrape live page (no FK insert)
    const live = await scrapeLumaEventDetailPage(slug);
    return NextResponse.json({
      slug,
      event: null,
      details: live,
      source: "live",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to load event details",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 404 }
    );
  }
}
