import https from "https";
import { URL } from "url";
import * as cheerio from "cheerio";
import { createEvent, findEventBySlug, listUpcomingEvents } from "@/lib/repos";
import { enrichEventsWithDetails } from "@/lib/luma-event-details";
import { LUMA_LOCATION_FEEDS, LUMA_TOPIC_FEEDS } from "@/lib/luma-feeds";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type ScrapedLumaEvent = {
  slug: string;
  lumaApiId: string | null;
  title: string;
  description: string;
  lumaUrl: string;
  coverUrl: string | null;
  location: string | null;
  isOnline: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  guestCount: number;
  isPaid: boolean;
  requiresApproval: boolean;
};

export type PageScrapeAttempt = {
  label: string;
  url: string;
  command: string;
  ok: boolean;
  status?: number;
  count: number;
  added: number;
  skipped: number;
  error?: string;
};

function buildCurl(url: string): string {
  return `curl -sSL -k -H "Accept: text/html" -H "User-Agent: ${UA}" "${url}"`;
}

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
): Promise<{ status: number; body: string; finalUrl: string }> {
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
        if (
          [301, 302, 307, 308].includes(status) &&
          res.headers.location
        ) {
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
            finalUrl: pageUrl,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Page fetch timed out"));
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

function normalizeSlug(input: string): string {
  const trimmed = input.trim();
  try {
    if (trimmed.startsWith("http")) {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || trimmed;
    }
  } catch {
    /* ignore */
  }
  return trimmed.replace(/^\/+/, "").split("?")[0];
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function locationFromEvent(event: Record<string, unknown>): {
  location: string | null;
  isOnline: boolean;
} {
  if (event.location_type === "online" || event.meeting_url) {
    return { location: "Online", isOnline: true };
  }
  const geo = event.geo_address_info as Record<string, unknown> | undefined;
  if (geo) {
    const location =
      pickString(geo.full_address, geo.address, geo.city_state) ||
      [geo.city, geo.region, geo.country].filter(Boolean).join(", ") ||
      null;
    return { location, isOnline: false };
  }
  return {
    location: pickString(event.location, event.city),
    isOnline: false,
  };
}

function entryToScraped(raw: Record<string, unknown>): ScrapedLumaEvent | null {
  const nested =
    raw.event && typeof raw.event === "object"
      ? (raw.event as Record<string, unknown>)
      : raw;

  const title = pickString(nested.name, nested.title, raw.name);
  const urlOrSlug = pickString(nested.url, raw.url, nested.api_id, raw.api_id);
  if (!title || !urlOrSlug) return null;

  // Skip category/place marketing cards without a real event slug
  const slug = normalizeSlug(urlOrSlug);
  if (!slug || slug.startsWith("cat-") || slug.startsWith("discplace-")) {
    return null;
  }
  if (slug === title.toLowerCase().replace(/\s+/g, "-")) {
    // still ok
  }

  const { location, isOnline } = locationFromEvent(nested);
  const ticket =
    (raw.ticket_info as Record<string, unknown> | undefined) ||
    (nested.ticket_info as Record<string, unknown> | undefined);

  const startsAt =
    parseDate(raw.start_at) ||
    parseDate(nested.start_at) ||
    parseDate(nested.startAt);
  const endsAt =
    parseDate(raw.end_at) ||
    parseDate(nested.end_at) ||
    parseDate(nested.endAt);

  // Prefer entries that look like dated events
  if (!startsAt && !pickString(nested.cover_url, raw.cover_url)) {
    return null;
  }

  return {
    slug,
    lumaApiId: pickString(nested.api_id, raw.api_id),
    title,
    description: pickString(nested.description, raw.description) || "",
    lumaUrl: `https://luma.com/${slug}`,
    coverUrl: pickString(nested.cover_url, raw.cover_url),
    location,
    isOnline,
    startsAt,
    endsAt,
    guestCount: Number(raw.guest_count || nested.guest_count || 0) || 0,
    isPaid: ticket ? ticket.is_free === false : false,
    requiresApproval: Boolean(
      ticket?.require_approval ||
        nested.require_rsvp_approval ||
        raw.require_rsvp_approval
    ),
  };
}

function collectFromNode(
  node: unknown,
  acc: Map<string, ScrapedLumaEvent>
): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) collectFromNode(item, acc);
    return;
  }

  const obj = node as Record<string, unknown>;
  const scraped = entryToScraped(obj);
  if (scraped && scraped.startsAt) {
    if (!acc.has(scraped.slug)) acc.set(scraped.slug, scraped);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") collectFromNode(value, acc);
  }
}

/**
 * GET a public Luma page (e.g. https://luma.com/london) and extract events
 * from embedded __NEXT_DATA__ — no discover API.
 */
export async function scrapeLumaPageEvents(
  pageUrl: string,
  label: string
): Promise<{ events: ScrapedLumaEvent[]; attempt: PageScrapeAttempt }> {
  const command = buildCurl(pageUrl);

  try {
    const response = await fetchHtmlWithTlsFallback(pageUrl);

    if (response.status >= 400) {
      return {
        events: [],
        attempt: {
          label,
          url: pageUrl,
          command,
          ok: false,
          status: response.status,
          count: 0,
          added: 0,
          skipped: 0,
          error: `HTTP ${response.status}`,
        },
      };
    }

    const html = response.body;
    const $ = cheerio.load(html);
    const nextRaw = $("#__NEXT_DATA__").html();
    if (!nextRaw) {
      return {
        events: [],
        attempt: {
          label,
          url: pageUrl,
          command,
          ok: false,
          status: response.status,
          count: 0,
          added: 0,
          skipped: 0,
          error: "No __NEXT_DATA__ on page",
        },
      };
    }

    let nextData: unknown;
    try {
      nextData = JSON.parse(nextRaw);
    } catch {
      return {
        events: [],
        attempt: {
          label,
          url: pageUrl,
          command,
          ok: false,
          status: response.status,
          count: 0,
          added: 0,
          skipped: 0,
          error: "Invalid __NEXT_DATA__ JSON",
        },
      };
    }

    const bySlug = new Map<string, ScrapedLumaEvent>();

    // Prefer explicit place events list when present
    const initial = (
      nextData as { props?: { pageProps?: { initialData?: unknown } } }
    )?.props?.pageProps?.initialData as
      | { data?: { events?: unknown[] } }
      | undefined;

    if (Array.isArray(initial?.data?.events)) {
      for (const entry of initial.data.events) {
        if (entry && typeof entry === "object") {
          const scraped = entryToScraped(entry as Record<string, unknown>);
          if (scraped) bySlug.set(scraped.slug, scraped);
        }
      }
    }

    // Also walk the tree for category / nested listings
    collectFromNode(nextData, bySlug);

    const events = Array.from(bySlug.values());

    return {
      events,
      attempt: {
        label,
        url: pageUrl,
        command,
        ok: true,
        status: response.status,
        count: events.length,
        added: 0,
        skipped: 0,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Page fetch failed";
    return {
      events: [],
      attempt: {
        label,
        url: pageUrl,
        command,
        ok: false,
        count: 0,
        added: 0,
        skipped: 0,
        error: isTlsError(err)
          ? `TLS/certificate error: ${message}`
          : message,
      },
    };
  }
}

/**
 * Insert scraped events. Existing slugs are discarded (not updated).
 * New rows get a follow-up GET to luma.com/{slug} into event_details.
 */
export async function insertNewEvents(
  events: ScrapedLumaEvent[],
  sourceLabel: string
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  const newSlugs: string[] = [];

  for (const event of events) {
    const existing = await findEventBySlug(event.slug);

    if (existing) {
      skipped += 1;
      continue;
    }

    await createEvent({
      slug: event.slug,
      lumaApiId: event.lumaApiId,
      title: event.title,
      description: event.description.slice(0, 4000),
      lumaUrl: event.lumaUrl,
      coverUrl: event.coverUrl,
      location: event.location,
      isOnline: event.isOnline,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      guestCount: event.guestCount,
      isPaid: event.isPaid,
      requiresApproval: event.requiresApproval,
      sourceFeeds: sourceLabel,
    });
    added += 1;
    newSlugs.push(event.slug);
  }

  if (newSlugs.length > 0) {
    // Full detail pages: GET https://luma.com/{slug} → event_details
    await enrichEventsWithDetails(newSlugs, { alsoBackfillMissing: 5 });
  }

  return { added, skipped };
}

export type DiscoverFromPagesResult = {
  events: {
    id: string;
    title: string;
    startAt: string | null;
    location: string | null;
    coverUrl: string | null;
    url: string;
    guestCount: number;
    matchedLocations?: string[];
    matchedTopics?: string[];
  }[];
  attempts: PageScrapeAttempt[];
  ok: boolean;
  error?: string;
  added: number;
  skipped: number;
};

/**
 * GET relevant luma.com city/topic pages, insert new events into DB,
 * return closest matching upcoming rows from the database.
 */
export async function discoverEventsFromWebsite(input: {
  locations?: string[];
  interests?: string[];
  limit?: number;
  mode?: "match" | "all";
}): Promise<DiscoverFromPagesResult> {
  const mode = input.mode || "match";
  const limit = input.limit ?? (mode === "all" ? 100 : 10);

  const locations = (input.locations || []).filter(
    (l) => l in LUMA_LOCATION_FEEDS
  );
  const interests = (input.interests || []).filter((i) => i in LUMA_TOPIC_FEEDS);

  const locList =
    locations.length > 0 ? locations : Object.keys(LUMA_LOCATION_FEEDS);
  const topicList =
    interests.length > 0 ? interests : Object.keys(LUMA_TOPIC_FEEDS);

  const jobs: { label: string; url: string }[] = [
    ...locList.map((loc) => ({
      label: loc,
      url: LUMA_LOCATION_FEEDS[loc].url,
    })),
    ...topicList.map((topic) => ({
      label: topic,
      url: LUMA_TOPIC_FEEDS[topic].url,
    })),
  ];

  const attempts: PageScrapeAttempt[] = [];
  let addedTotal = 0;
  let skippedTotal = 0;

  const results = await Promise.all(
    jobs.map(async (job) => {
      const { events, attempt } = await scrapeLumaPageEvents(job.url, job.label);
      const { added, skipped } = await insertNewEvents(events, job.label);
      return {
        attempt: { ...attempt, added, skipped },
        events,
        label: job.label,
      };
    })
  );

  for (const r of results) {
    attempts.push(r.attempt);
    addedTotal += r.attempt.added;
    skippedTotal += r.attempt.skipped;
  }

  const anyOk = attempts.some((a) => a.ok);
  const failDetail = attempts
    .map(
      (a) =>
        `${a.label}: ${a.ok ? `ok (${a.count} events)` : a.error || "failed"}\n${a.command}`
    )
    .join("\n\n");

  const dbEvents = await listUpcomingEvents(400);

  // If live scrapes all failed but we already have events in DB, serve those
  if (!anyOk && dbEvents.length === 0) {
    return {
      events: [],
      attempts,
      ok: false,
      error: `Failed to scrape Luma pages.\n\n${failDetail}`,
      added: addedTotal,
      skipped: skippedTotal,
    };
  }

  const scrapeWarning = !anyOk
    ? `Live scrape failed (showing saved events).\n\n${failDetail}`
    : undefined;

  const scored = dbEvents.map((ev) => {
    const feeds = (ev.sourceFeeds || "").split("|").filter(Boolean);
    const hay = `${ev.title} ${ev.location || ""} ${ev.sourceFeeds}`.toLowerCase();

    const matchedLocations = locList.filter(
      (loc) =>
        feeds.includes(loc) ||
        (ev.location || "").toLowerCase().includes(loc.toLowerCase())
    );
    const matchedTopics = topicList.filter((topic) => {
      if (feeds.includes(topic)) return true;
      const kw = LUMA_TOPIC_FEEDS[topic]?.keywords || [];
      return (
        kw.some((k) => hay.includes(k)) ||
        hay.includes(topic.toLowerCase())
      );
    });

    let score = 0;
    if (matchedLocations.length) score += 4;
    if (matchedTopics.length) score += 3;
    if (matchedLocations.length && matchedTopics.length) score += 8;
    if (feeds.some((f) => locList.includes(f) || topicList.includes(f))) {
      score += 2;
    }

    const startMs = ev.startsAt ? ev.startsAt.getTime() : Number.POSITIVE_INFINITY;
    return { ev, matchedLocations, matchedTopics, score, startMs };
  });

  let pool = scored;
  if (mode === "match") {
    const both = scored.filter(
      (s) => s.matchedLocations.length > 0 && s.matchedTopics.length > 0
    );
    const either = scored.filter(
      (s) => s.matchedLocations.length > 0 || s.matchedTopics.length > 0
    );
    pool = both.length >= Math.min(3, limit) ? both : either.length ? either : scored;
    pool.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.startMs - b.startMs;
    });
  } else {
    pool = scored.filter(
      (s) =>
        s.matchedLocations.length > 0 ||
        s.matchedTopics.length > 0 ||
        locList.length + topicList.length === 0
    );
    if (!pool.length) pool = scored;
    pool.sort((a, b) => a.startMs - b.startMs);
  }

  const events = pool.slice(0, limit).map(({ ev, matchedLocations, matchedTopics }) => ({
    id: ev.slug,
    title: ev.title,
    startAt: ev.startsAt ? ev.startsAt.toISOString() : null,
    location: ev.location,
    coverUrl: ev.coverUrl,
    url: ev.lumaUrl,
    guestCount: ev.guestCount,
    matchedLocations,
    matchedTopics,
  }));

  const failed = attempts.filter((a) => !a.ok);
  if (!events.length) {
    return {
      events: [],
      attempts,
      ok: false,
      error: `No events found after scraping.\n\n${failDetail}`,
      added: addedTotal,
      skipped: skippedTotal,
    };
  }

  const partial =
    scrapeWarning ||
    (failed.length > 0
      ? `Some pages failed:\n${failed
          .map((a) => `${a.label}: ${a.error}\n${a.command}`)
          .join("\n\n")}`
      : undefined);

  return {
    events,
    attempts,
    ok: true,
    error: partial,
    added: addedTotal,
    skipped: skippedTotal,
  };
}
