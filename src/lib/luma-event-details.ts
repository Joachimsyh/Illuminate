import * as cheerio from "cheerio";
import {
  findEventBySlug,
  findEventDetailBySlug,
  listEventSlugsMissingDetails,
  upsertEventDetail,
} from "@/lib/repos";

/**
 * Reuse the same HTML fetch helpers as city/topic scrapes.
 * Imported dynamically-ish via shared module to avoid circular deps —
 * duplicate TLS-safe GET is small and intentional.
 */
import https from "https";
import { URL } from "url";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function shouldBypassTls(): boolean {
  return (
    process.env.SSL_NO_VERIFY === "1" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  );
}

function isTlsError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return (
    /certificate|SSL|TLS|UNABLE_TO_VERIFY|self.signed/i.test(message) ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  );
}

function fetchHtml(
  pageUrl: string,
  bypassTls: boolean
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(pageUrl);
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        rejectUnauthorized: !bypassTls,
        timeout: 25000,
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 307, 308].includes(status) && res.headers.location) {
          const next = new URL(res.headers.location, pageUrl).toString();
          res.resume();
          resolve(fetchHtml(next, bypassTls));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) =>
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
        );
        res.on("end", () => {
          resolve({
            status,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Event detail fetch timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchHtmlWithTlsFallback(pageUrl: string) {
  try {
    return await fetchHtml(pageUrl, shouldBypassTls());
  } catch (err) {
    if (isTlsError(err) && !shouldBypassTls()) {
      return await fetchHtml(pageUrl, true);
    }
    throw err;
  }
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function jsonString(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

/** Walk Luma ProseMirror / tip-tap description_mirror into plain text. */
export function descriptionMirrorToText(mirror: unknown): string {
  if (!mirror || typeof mirror !== "object") return "";
  const root = mirror as { text?: unknown; content?: unknown[] };
  if (typeof root.text === "string") return root.text.trim();

  const parts: string[] = [];
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as { text?: unknown; content?: unknown[]; type?: string };
      if (typeof n.text === "string") parts.push(n.text);
      if (n.content) walk(n.content);
      if (n.type === "paragraph" || n.type === "heading") parts.push("\n");
    }
  };
  walk(root.content);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

function locationFromEvent(event: Record<string, unknown>): {
  location: string | null;
  locationJson: string;
  isOnline: boolean;
} {
  const virtual = event.virtual_info as Record<string, unknown> | undefined;
  if (
    event.location_type === "online" ||
    event.meeting_url ||
    virtual?.has_access !== undefined
  ) {
    const locJson = jsonString(
      { type: "online", virtual_info: virtual, meeting_url: event.meeting_url },
      "{}"
    );
    return { location: "Online", locationJson: locJson, isOnline: true };
  }

  const geo = event.geo_address_info as Record<string, unknown> | undefined;
  if (geo) {
    const location =
      pickString(geo.full_address, geo.address, geo.city_state) ||
      [geo.city, geo.region, geo.country].filter(Boolean).join(", ") ||
      null;
    return {
      location,
      locationJson: jsonString(geo, "{}"),
      isOnline: false,
    };
  }

  return {
    location: pickString(event.location, event.city),
    locationJson: "{}",
    isOnline: false,
  };
}

export type ScrapedEventDetail = {
  slug: string;
  lumaApiId: string | null;
  title: string;
  descriptionText: string;
  descriptionMirrorJson: string;
  coverUrl: string | null;
  socialImageUrl: string | null;
  location: string | null;
  locationJson: string;
  isOnline: boolean;
  timezone: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  guestCount: number;
  ticketCount: number;
  isFree: boolean;
  isSoldOut: boolean;
  requiresApproval: boolean;
  registrationAvailability: string | null;
  waitlistEnabled: boolean;
  hostsJson: string;
  ticketTypesJson: string;
  ticketInfoJson: string;
  registrationQuestionsJson: string;
  categoriesJson: string;
  featuredGuestsJson: string;
  calendarJson: string;
  faqsJson: string | null;
  payloadJson: string;
};

/**
 * GET https://luma.com/{slug} and parse __NEXT_DATA__ event payload.
 * `slug` is the public path id (e.g. tldraw-vp8y), not the DB uuid.
 */
export async function scrapeLumaEventDetailPage(
  slug: string
): Promise<ScrapedEventDetail> {
  const clean = slug.replace(/^\/+/, "").split("?")[0].split("/")[0];
  if (!clean) throw new Error("Missing event slug");

  const pageUrl = `https://luma.com/${clean}`;
  const response = await fetchHtmlWithTlsFallback(pageUrl);
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} for ${pageUrl}`);
  }

  const $ = cheerio.load(response.body);
  const nextRaw = $("#__NEXT_DATA__").html();
  if (!nextRaw) throw new Error(`No __NEXT_DATA__ on ${pageUrl}`);

  let nextData: unknown;
  try {
    nextData = JSON.parse(nextRaw);
  } catch {
    throw new Error(`Invalid __NEXT_DATA__ on ${pageUrl}`);
  }

  const pageProps = (
    nextData as { props?: { pageProps?: { initialData?: unknown } } }
  )?.props?.pageProps;

  const initial = pageProps?.initialData as
    | { kind?: string; data?: Record<string, unknown> }
    | undefined;

  const data = (initial?.data || {}) as Record<string, unknown>;
  if (!data.event && !data.api_id) {
    throw new Error(`No event payload on ${pageUrl}`);
  }

  const event = (data.event as Record<string, unknown>) || {};
  const ticketInfo =
    (data.ticket_info as Record<string, unknown> | undefined) || {};
  const mirror = data.description_mirror;
  const descriptionText =
    descriptionMirrorToText(mirror) ||
    pickString(
      typeof event.description === "string" ? event.description : null
    ) ||
    "";

  const { location, locationJson, isOnline } = locationFromEvent(event);

  const urlSlug =
    pickString(event.url) ||
    clean;

  return {
    slug: urlSlug,
    lumaApiId: pickString(data.api_id, event.api_id),
    title:
      pickString(event.name, data.name as string) ||
      clean,
    descriptionText,
    descriptionMirrorJson: jsonString(mirror ?? {}, "{}"),
    coverUrl: pickString(event.cover_url, data.cover_url as string),
    socialImageUrl: pickString(
      event.social_image_url,
      (data.social_image as Record<string, unknown> | undefined)?.cdn_url
    ),
    location,
    locationJson,
    isOnline,
    timezone: pickString(event.timezone, data.timezone as string),
    startsAt:
      parseDate(data.start_at) ||
      parseDate(event.start_at) ||
      null,
    endsAt: parseDate(event.end_at) || parseDate(data.end_at) || null,
    guestCount: Number(data.guest_count || 0) || 0,
    ticketCount: Number(data.ticket_count || 0) || 0,
    isFree: ticketInfo.is_free !== false,
    isSoldOut: Boolean(data.sold_out || ticketInfo.is_sold_out),
    requiresApproval: Boolean(
      ticketInfo.require_approval || event.require_rsvp_approval
    ),
    registrationAvailability: pickString(data.registration_availability),
    waitlistEnabled: Boolean(event.waitlist_enabled),
    hostsJson: jsonString(data.hosts ?? [], "[]"),
    ticketTypesJson: jsonString(data.ticket_types ?? [], "[]"),
    ticketInfoJson: jsonString(ticketInfo, "{}"),
    registrationQuestionsJson: jsonString(
      data.registration_questions ?? [],
      "[]"
    ),
    categoriesJson: jsonString(data.categories ?? [], "[]"),
    featuredGuestsJson: jsonString(data.featured_guests ?? [], "[]"),
    calendarJson: jsonString(data.calendar ?? {}, "{}"),
    faqsJson: data.faqs == null ? null : jsonString(data.faqs, "null"),
    payloadJson: jsonString(data, "{}"),
  };
}

/**
 * Fetch detail page for a slug and upsert into event_details.
 * Requires a row in `events` (FK on slug).
 */
export async function fetchAndStoreEventDetails(
  slug: string,
  options?: { force?: boolean }
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const clean = slug.replace(/^\/+/, "").split("?")[0].split("/")[0];
  const event = await findEventBySlug(clean);
  if (!event) {
    return { ok: false, error: `No events row for slug ${clean}` };
  }

  if (!options?.force) {
    const existing = await findEventDetailBySlug(clean);
    if (existing) return { ok: true, skipped: true };
  }

  try {
    const detail = await scrapeLumaEventDetailPage(clean);
    // Keep FK slug = events.slug even if Luma url field differs slightly
    await upsertEventDetail({ ...detail, slug: clean });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Detail scrape failed",
    };
  }
}

/**
 * For newly discovered events (and a small backlog without details),
 * GET luma.com/{slug} and fill event_details.
 */
export async function enrichEventsWithDetails(
  slugs: string[],
  options?: { alsoBackfillMissing?: number }
): Promise<{ fetched: number; skipped: number; failed: number }> {
  const unique = Array.from(new Set(slugs.filter(Boolean)));
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of unique) {
    const result = await fetchAndStoreEventDetails(slug);
    if (result.skipped) skipped += 1;
    else if (result.ok) fetched += 1;
    else failed += 1;
  }

  const backfill = options?.alsoBackfillMissing ?? 0;
  if (backfill > 0) {
    const missing = await listEventSlugsMissingDetails(backfill);
    for (const slug of missing) {
      if (unique.includes(slug)) continue;
      const result = await fetchAndStoreEventDetails(slug);
      if (result.skipped) skipped += 1;
      else if (result.ok) fetched += 1;
      else failed += 1;
    }
  }

  return { fetched, skipped, failed };
}
