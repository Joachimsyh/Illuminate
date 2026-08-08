import * as cheerio from "cheerio";
import axios from "axios";
import { LUMA_LOCATION_FEEDS, LUMA_TOPIC_FEEDS } from "@/lib/luma-feeds";

export type FormField = {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  value?: string;
};

export type LumaEventData = {
  eventId: string;
  slug: string;
  title: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  location: string | null;
  coverUrl: string | null;
  hosts: { name: string; avatarUrl?: string }[];
  guestCount: number;
  isSoldOut: boolean;
  requiresApproval: boolean;
  ticketTypes: {
    id: string;
    name: string;
    isFree: boolean;
    price?: number;
    currency?: string;
  }[];
  formFields: FormField[];
  csrfToken: string | null;
  submitEndpoint: string;
  rawNextData?: unknown;
  sourceUrl: string;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function normalizeEventId(input: string): string {
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

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function extractLocation(event: Record<string, unknown>): string | null {
  const geo = event.geo_address_info as Record<string, unknown> | undefined;
  if (geo) {
    return (
      pickString(geo.full_address, geo.address, geo.city_state) ||
      [geo.city, geo.region, geo.country].filter(Boolean).join(", ") ||
      null
    );
  }
  if (event.location_type === "online" || event.meeting_url) {
    return "Online";
  }
  return pickString(event.location, event.city) || null;
}

function extractFormFields(
  data: Record<string, unknown>,
  $: cheerio.CheerioAPI
): FormField[] {
  const fields: FormField[] = [];
  const seen = new Set<string>();

  const push = (field: FormField) => {
    const key = field.id || field.name || field.label;
    if (!key || seen.has(key)) return;
    seen.add(key);
    fields.push(field);
  };

  // Always include core identity fields Luma expects
  push({
    id: "name",
    name: "name",
    label: "Full name",
    type: "text",
    required: true,
  });
  push({
    id: "email",
    name: "email",
    label: "Email",
    type: "email",
    required: true,
  });

  const questionSources = [
    data.registration_questions,
    data.registrationQuestions,
    (data.event as Record<string, unknown> | undefined)?.registration_questions,
    (data.event as Record<string, unknown> | undefined)?.registrationQuestions,
    data.guest_questions,
  ];

  for (const source of questionSources) {
    if (!Array.isArray(source)) continue;
    for (const q of source) {
      const question = q as Record<string, unknown>;
      const id = String(
        question.id || question.question_id || question.label || Math.random()
      );
      push({
        id,
        name: String(question.name || question.id || id),
        label: String(question.label || question.question || "Question"),
        type: String(question.type || question.input_type || "text"),
        required: Boolean(question.required ?? question.is_required),
        options: Array.isArray(question.options)
          ? question.options.map(String)
          : undefined,
      });
    }
  }

  // Fallback: scrape visible form inputs from HTML
  $("form input, form select, form textarea").each((_, el) => {
    const name = $(el).attr("name") || $(el).attr("id");
    if (!name || name.startsWith("_next")) return;
    const type = $(el).attr("type") || el.tagName.toLowerCase();
    if (["hidden", "submit", "button"].includes(type)) return;
    push({
      id: name,
      name,
      label:
        $(`label[for="${$(el).attr("id")}"]`).text().trim() ||
        $(el).attr("placeholder") ||
        name,
      type,
      required: $(el).attr("required") !== undefined,
      value: $(el).attr("value") || undefined,
    });
  });

  return fields;
}

function extractCsrf($: cheerio.CheerioAPI, html: string): string | null {
  const fromMeta =
    $('meta[name="csrf-token"]').attr("content") ||
    $('meta[name="x-csrf-token"]').attr("content");
  if (fromMeta) return fromMeta;

  const fromInput =
    $('input[name="csrf"]').attr("value") ||
    $('input[name="_csrf"]').attr("value") ||
    $('input[name="csrfmiddlewaretoken"]').attr("value") ||
    $('input[name="authenticity_token"]').attr("value");
  if (fromInput) return fromInput;

  const cookieMatch = html.match(/csrf[_-]?token["'=:\s]+([A-Za-z0-9_-]{8,})/i);
  return cookieMatch?.[1] ?? null;
}

function digEventBundle(nextData: Record<string, unknown>): Record<string, unknown> {
  const pageProps = (nextData.props as Record<string, unknown> | undefined)
    ?.pageProps as Record<string, unknown> | undefined;

  const candidates = [
    pageProps?.initialData,
    pageProps?.data,
    pageProps?.event,
    (pageProps?.initialData as Record<string, unknown> | undefined)?.data,
  ];

  for (const c of candidates) {
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      if (obj.event || obj.name || obj.api_id) return obj;
      if ((obj.data as Record<string, unknown> | undefined)?.event) {
        return obj.data as Record<string, unknown>;
      }
    }
  }

  return pageProps || {};
}

/**
 * Fetch a single Luma event page the user requested.
 * Uses SCRAPE_API_KEY (ScrapingBee-compatible) when set; never bulk-scrapes cities.
 */
export async function fetchEventHtml(eventIdOrUrl: string): Promise<{
  html: string;
  finalUrl: string;
  eventId: string;
}> {
  const eventId = normalizeEventId(eventIdOrUrl);
  const url = `https://lu.ma/${eventId}`;
  const scrapeKey = process.env["SCRAPE_API_KEY"];

  let html: string;
  let finalUrl = url;

  if (scrapeKey) {
    // ScrapingBee-compatible proxy — only for the user-requested event URL
    const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${encodeURIComponent(
      scrapeKey
    )}&url=${encodeURIComponent(url)}&render_js=false`;
    const response = await axios.get<string>(proxyUrl, {
      headers: { Accept: "text/html" },
      timeout: 45000,
      validateStatus: (s) => s < 500,
    });
    if (response.status === 401 || response.status === 403) {
      // Key may not be ScrapingBee — fall back to direct fetch
      const direct = await axios.get<string>(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html",
          "x-api-key": scrapeKey,
          Authorization: `Bearer ${scrapeKey}`,
        },
        timeout: 20000,
        validateStatus: (s) => s < 500,
      });
      html = direct.data;
      finalUrl = direct.request?.res?.responseUrl || url;
    } else {
      html = response.data;
    }
  } else {
    const response = await axios.get<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
    });
    html = response.data;
    finalUrl = response.request?.res?.responseUrl || url;
    if (response.status === 404) {
      throw new Error(`Event not found: ${eventId}`);
    }
  }

  if (!html || html.length < 40) {
    throw new Error(`Event not found: ${eventId}`);
  }

  return { html, finalUrl, eventId };
}

export async function scrapeLumaEvent(
  eventIdOrUrl: string
): Promise<LumaEventData> {
  const { html, finalUrl, eventId } = await fetchEventHtml(eventIdOrUrl);
  const $ = cheerio.load(html);

  const nextDataRaw = $("#__NEXT_DATA__").html();
  let nextData: Record<string, unknown> = {};
  if (nextDataRaw) {
    try {
      nextData = JSON.parse(nextDataRaw);
    } catch {
      nextData = {};
    }
  }

  const bundle = digEventBundle(nextData);
  const event = (bundle.event as Record<string, unknown>) || bundle;

  const title =
    pickString(event.name, event.title, $("h1").first().text(), $("title").text()) ||
    `Luma Event ${eventId}`;

  const description =
    pickString(
      typeof event.description === "string" ? event.description : null,
      (event.description_mirror as Record<string, unknown> | undefined)?.text,
      $('meta[property="og:description"]').attr("content")
    ) || "";

  const startAt = pickString(
    event.start_at,
    event.startAt,
    bundle.start_at as string
  );
  const endAt = pickString(event.end_at, event.endAt, bundle.end_at as string);
  const timezone = pickString(event.timezone, event.tz);

  const coverUrl =
    pickString(
      event.cover_url,
      event.coverUrl,
      (event.cover_image as Record<string, unknown> | undefined)?.url,
      $('meta[property="og:image"]').attr("content")
    ) || null;

  const hostsRaw = (bundle.hosts || event.hosts || []) as Record<
    string,
    unknown
  >[];
  const hosts = (Array.isArray(hostsRaw) ? hostsRaw : []).map((h) => ({
    name: String(h.name || h.username || "Host"),
    avatarUrl: pickString(h.avatar_url, h.avatarUrl) || undefined,
  }));

  const ticketTypesRaw = (bundle.ticket_types ||
    bundle.ticketTypes ||
    []) as Record<string, unknown>[];
  const ticketTypes = (Array.isArray(ticketTypesRaw) ? ticketTypesRaw : []).map(
    (t, i) => ({
      id: String(t.id || t.api_id || `ticket-${i}`),
      name: String(t.name || "General"),
      isFree: Boolean(t.is_free ?? t.isFree ?? !t.price),
      price:
        typeof t.price === "number"
          ? t.price
          : typeof t.cents === "number"
            ? t.cents / 100
            : undefined,
      currency: pickString(t.currency) || undefined,
    })
  );

  const formFields = extractFormFields(bundle, $);
  const csrfToken = extractCsrf($, html);

  // Prefer official guest API; fall back to form action
  const formAction = $("form").first().attr("action");
  const apiId = pickString(event.api_id, event.id, bundle.api_id as string);
  const submitEndpoint =
    formAction && formAction.startsWith("http")
      ? formAction
      : formAction
        ? `https://lu.ma${formAction}`
        : `https://api.lu.ma/event/independent/register`;

  return {
    eventId: apiId || eventId,
    slug: eventId,
    title: title.replace(/\s*\|\s*Luma.*/i, "").trim(),
    description: description.slice(0, 2000),
    startAt,
    endAt,
    timezone,
    location: extractLocation(event),
    coverUrl,
    hosts,
    guestCount: Number(bundle.guest_count || bundle.ticket_count || 0) || 0,
    isSoldOut: Boolean(bundle.sold_out || event.sold_out),
    requiresApproval: Boolean(
      bundle.require_rsvp_approval ||
        event.require_rsvp_approval ||
        bundle.requires_approval
    ),
    ticketTypes,
    formFields,
    csrfToken,
    submitEndpoint,
    rawNextData: process.env.NODE_ENV === "development" ? undefined : undefined,
    sourceUrl: finalUrl,
  };
}

export type DiscoverEvent = {
  id: string;
  title: string;
  startAt: string | null;
  location: string | null;
  coverUrl: string | null;
  url: string;
  guestCount: number;
  matchedLocations?: string[];
  matchedTopics?: string[];
};

type RawDiscoverEntry = {
  api_id?: string;
  start_at?: string;
  guest_count?: number;
  event?: {
    api_id?: string;
    name?: string;
    url?: string;
    start_at?: string;
    cover_url?: string;
    geo_address_info?: {
      city?: string;
      region?: string;
      country?: string;
      full_address?: string;
      address?: string;
    };
    location_type?: string;
  };
};

export type DiscoverFeedAttempt = {
  label: string;
  url: string;
  command: string;
  ok: boolean;
  status?: number;
  count: number;
  error?: string;
};

export type DiscoverResult = {
  events: DiscoverEvent[];
  attempts: DiscoverFeedAttempt[];
  ok: boolean;
  error?: string;
};

function buildCurlCommand(url: string): string {
  return `curl -sS -H "Accept: application/json" -H "Origin: https://luma.com" -H "Referer: https://luma.com/" "${url}"`;
}

async function fetchDiscoverEntries(params: {
  label: string;
  placeApiId?: string;
  categoryApiId?: string;
  limit?: number;
}): Promise<{ entries: RawDiscoverEntry[]; attempt: DiscoverFeedAttempt }> {
  const limit = params.limit ?? 25;
  const qs = new URLSearchParams({
    pagination_limit: String(limit),
  });
  if (params.placeApiId) {
    qs.set("discover_place_api_id", params.placeApiId);
  }
  if (params.categoryApiId) {
    qs.set("discover_category_api_id", params.categoryApiId);
  }

  const url = `https://api.lu.ma/discover/get-paginated-events?${qs}`;
  const command = buildCurlCommand(url);

  try {
    const response = await axios.get<{ entries?: RawDiscoverEntry[] }>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Origin: "https://luma.com",
        Referer: "https://luma.com/",
      },
      timeout: 20000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      return {
        entries: [],
        attempt: {
          label: params.label,
          url,
          command,
          ok: false,
          status: response.status,
          count: 0,
          error: `HTTP ${response.status}`,
        },
      };
    }

    const entries = Array.isArray(response.data?.entries)
      ? response.data.entries
      : [];

    return {
      entries,
      attempt: {
        label: params.label,
        url,
        command,
        ok: true,
        status: response.status,
        count: entries.length,
      },
    };
  } catch (err) {
    return {
      entries: [],
      attempt: {
        label: params.label,
        url,
        command,
        ok: false,
        count: 0,
        error: err instanceof Error ? err.message : "Request failed",
      },
    };
  }
}

function entryToDiscoverEvent(entry: RawDiscoverEntry): DiscoverEvent | null {
  const ev = entry.event;
  if (!ev?.name || !ev.url) return null;
  const geo = ev.geo_address_info;
  const location =
    pickString(geo?.full_address, geo?.address, geo?.city) ||
    [geo?.city, geo?.region, geo?.country].filter(Boolean).join(", ") ||
    (ev.location_type === "online" ? "Online" : null);

  return {
    id: normalizeEventId(ev.url),
    title: ev.name,
    startAt: pickString(entry.start_at, ev.start_at),
    location,
    coverUrl: pickString(ev.cover_url) || null,
    url: `https://luma.com/${normalizeEventId(ev.url)}`,
    guestCount: Number(entry.guest_count || 0) || 0,
  };
}

function matchesLocation(
  event: DiscoverEvent,
  locations: string[]
): string[] {
  const hay = `${event.location || ""} ${event.title}`.toLowerCase();
  return locations.filter((loc) => hay.includes(loc.toLowerCase()));
}

function matchesTopic(
  event: DiscoverEvent,
  topics: string[],
  fromTopicFeeds: Set<string>
): string[] {
  const hay = `${event.title} ${event.location || ""}`.toLowerCase();
  const hit: string[] = [];
  for (const topic of topics) {
    if (fromTopicFeeds.has(`${event.id}::${topic}`)) {
      hit.push(topic);
      continue;
    }
    const feed = LUMA_TOPIC_FEEDS[topic];
    if (!feed) continue;
    if (
      feed.keywords.some((k) => hay.includes(k)) ||
      hay.includes(topic.toLowerCase())
    ) {
      hit.push(topic);
    }
  }
  return hit;
}

/**
 * Scrape Luma city + topic discover feeds for the user's selections.
 * - default: closest matching upcoming events (limit)
 * - mode "all": every real upcoming event from selected location/topic feeds (no demos)
 */
export async function discoverEventsForProfile(input: {
  locations?: string[];
  interests?: string[];
  limit?: number;
  mode?: "match" | "all";
}): Promise<DiscoverResult> {
  const mode = input.mode || "match";
  const limit = input.limit ?? (mode === "all" ? 100 : 10);
  const perFeed = mode === "all" ? 50 : 30;

  const locations = (input.locations || []).filter(
    (l) => l in LUMA_LOCATION_FEEDS
  );
  const interests = (input.interests || []).filter((i) => i in LUMA_TOPIC_FEEDS);

  const locList =
    locations.length > 0 ? locations : Object.keys(LUMA_LOCATION_FEEDS);
  const topicList =
    interests.length > 0 ? interests : Object.keys(LUMA_TOPIC_FEEDS);

  const byId = new Map<
    string,
    DiscoverEvent & { _score: number; _fromTopic: Set<string> }
  >();
  const topicOrigin = new Set<string>();
  const attempts: DiscoverFeedAttempt[] = [];

  const placeJobs = locList.map(async (loc) => {
    const feed = LUMA_LOCATION_FEEDS[loc];
    const { entries, attempt } = await fetchDiscoverEntries({
      label: `location:${loc}`,
      placeApiId: feed.placeApiId,
      limit: perFeed,
    });
    return { loc, entries, attempt };
  });

  const topicJobs = topicList.map(async (topic) => {
    const feed = LUMA_TOPIC_FEEDS[topic];
    const { entries, attempt } = await fetchDiscoverEntries({
      label: `topic:${topic}`,
      categoryApiId: feed.categoryApiId,
      limit: perFeed,
    });
    return { topic, entries, attempt };
  });

  const [placeResults, topicResults] = await Promise.all([
    Promise.all(placeJobs),
    Promise.all(topicJobs),
  ]);

  for (const { loc, entries, attempt } of placeResults) {
    attempts.push(attempt);
    for (const entry of entries) {
      const event = entryToDiscoverEvent(entry);
      if (!event) continue;
      const existing = byId.get(event.id);
      if (existing) {
        existing.matchedLocations = Array.from(
          new Set([...(existing.matchedLocations || []), loc])
        );
        existing._score += 3;
      } else {
        byId.set(event.id, {
          ...event,
          matchedLocations: [loc],
          matchedTopics: [],
          _score: 3,
          _fromTopic: new Set(),
        });
      }
    }
  }

  for (const { topic, entries, attempt } of topicResults) {
    attempts.push(attempt);
    for (const entry of entries) {
      const event = entryToDiscoverEvent(entry);
      if (!event) continue;
      topicOrigin.add(`${event.id}::${topic}`);
      const existing = byId.get(event.id);
      if (existing) {
        existing.matchedTopics = Array.from(
          new Set([...(existing.matchedTopics || []), topic])
        );
        existing._fromTopic.add(topic);
        existing._score += 2;
      } else {
        byId.set(event.id, {
          ...event,
          matchedLocations: matchesLocation(event, locList),
          matchedTopics: [topic],
          _score: 2,
          _fromTopic: new Set([topic]),
        });
      }
    }
  }

  const failedAttempts = attempts.filter((a) => !a.ok);
  const anyOk = attempts.some((a) => a.ok);

  if (!anyOk) {
    const cmds = failedAttempts.map((a) => a.command).join("\n");
    return {
      events: [],
      attempts,
      ok: false,
      error: `Failed to fetch Luma events. Commands used:\n${cmds}`,
    };
  }

  const now = Date.now();
  const scored = Array.from(byId.values()).map((event) => {
    const locs = matchesLocation(event, locList);
    const topics = matchesTopic(event, topicList, topicOrigin);
    let score = event._score;
    if (locs.length) score += 2;
    if (topics.length) score += 2;
    if (locs.length && topics.length) score += 8;

    const startMs = event.startAt ? Date.parse(event.startAt) : NaN;
    const upcoming = !Number.isNaN(startMs) && startMs >= now - 60 * 60 * 1000;
    if (upcoming) score += 1;
    else score -= 5;

    return {
      ...event,
      matchedLocations: locs.length ? locs : event.matchedLocations,
      matchedTopics: topics.length ? topics : event.matchedTopics,
      _score: score,
      _startMs: Number.isNaN(startMs) ? Number.POSITIVE_INFINITY : startMs,
    };
  });

  let pool = scored;
  if (mode === "match") {
    const both = scored.filter(
      (e) =>
        (e.matchedLocations?.length || 0) > 0 &&
        (e.matchedTopics?.length || 0) > 0
    );
    pool = both.length >= Math.min(3, limit) ? both : scored;
    pool.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return a._startMs - b._startMs;
    });
  } else {
    // all real upcoming from category/location feeds
    pool = scored.filter((e) => e._startMs >= now - 60 * 60 * 1000);
    pool.sort((a, b) => a._startMs - b._startMs);
  }

  const picked: DiscoverEvent[] = pool.slice(0, limit).map((event) => ({
    id: event.id,
    title: event.title,
    startAt: event.startAt,
    location: event.location,
    coverUrl: event.coverUrl,
    url: event.url,
    guestCount: event.guestCount,
    matchedLocations: event.matchedLocations,
    matchedTopics: event.matchedTopics,
  }));

  if (picked.length > 0) {
    return {
      events: picked,
      attempts,
      ok: true,
      error:
        failedAttempts.length > 0
          ? `Some feeds failed:\n${failedAttempts
              .map((a) => `${a.label}: ${a.error}\n${a.command}`)
              .join("\n\n")}`
          : undefined,
    };
  }

  // Strict / refresh: never inject demo events
  if (mode === "all") {
    const cmds = attempts.map((a) => a.command).join("\n");
    return {
      events: [],
      attempts,
      ok: false,
      error: `No real Luma events returned for your categories. Commands used:\n${cmds}`,
    };
  }

  // Soft mode: curated demos so first paint isn't empty
  return {
    events: FALLBACK_EVENTS.slice(0, limit).map((e) => ({
      ...e,
      url: `https://luma.com/${e.id}`,
    })),
    attempts,
    ok: true,
    error:
      failedAttempts.length > 0
        ? `Live feeds failed; showing demos. Commands used:\n${failedAttempts
            .map((a) => a.command)
            .join("\n")}`
        : undefined,
  };
}

/**
 * @deprecated Prefer discoverEventsForProfile. Kept for agent/API callers.
 */
export async function discoverEvents(query?: string): Promise<DiscoverEvent[]> {
  const q = query?.trim();
  if (q) {
    const looksLikeSlug =
      /^https?:\/\/(lu\.ma|luma\.com)\//i.test(q) ||
      (/^[a-z0-9_-]+$/i.test(q) && !q.includes(" "));
    if (looksLikeSlug) {
      try {
        const event = await scrapeOrFallback(q);
        return [
          {
            id: event.slug,
            title: event.title,
            startAt: event.startAt,
            location: event.location,
            coverUrl: event.coverUrl,
            url: event.sourceUrl,
            guestCount: event.guestCount,
          },
        ];
      } catch {
        /* ignore */
      }
    }
  }

  return discoverEventsForProfile({ limit: 10 }).then((r) => r.events);
}

function collectEventEntries(
  node: unknown,
  acc: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  if (!node || typeof node !== "object") return acc;

  if (Array.isArray(node)) {
    for (const item of node) collectEventEntries(item, acc);
    return acc;
  }

  const obj = node as Record<string, unknown>;
  const hasName = typeof obj.name === "string";
  const hasStart = "start_at" in obj || "startAt" in obj;
  const hasUrl = typeof obj.url === "string" || typeof obj.api_id === "string";

  if (hasName && (hasStart || hasUrl) && obj.name !== "Luma") {
    acc.push(obj);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") collectEventEntries(value, acc);
  }

  return acc;
}

const FALLBACK_EVENTS = [
  {
    id: "monad-blitz",
    title: "Monad Blitz Hackathon",
    startAt: new Date(Date.now() + 86400000 * 3).toISOString(),
    location: "San Francisco, CA",
    coverUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80",
    guestCount: 420,
  },
  {
    id: "ai-builders-night",
    title: "AI Builders Night",
    startAt: new Date(Date.now() + 86400000 * 5).toISOString(),
    location: "New York, NY",
    coverUrl:
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&q=80",
    guestCount: 186,
  },
  {
    id: "web3-founders-meetup",
    title: "Web3 Founders Meetup",
    startAt: new Date(Date.now() + 86400000 * 7).toISOString(),
    location: "London, UK",
    coverUrl:
      "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1200&q=80",
    guestCount: 98,
  },
  {
    id: "startup-pitch-clinic",
    title: "Startup Pitch Clinic",
    startAt: new Date(Date.now() + 86400000 * 10).toISOString(),
    location: "Online",
    coverUrl:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&q=80",
    guestCount: 240,
  },
  {
    id: "design-systems-salon",
    title: "Design Systems Salon",
    startAt: new Date(Date.now() + 86400000 * 12).toISOString(),
    location: "Berlin",
    coverUrl:
      "https://images.unsplash.com/photo-1558655146-d09347e92766?w=1200&q=80",
    guestCount: 72,
  },
  {
    id: "devtools-happy-hour",
    title: "DevTools Happy Hour",
    startAt: new Date(Date.now() + 86400000 * 4).toISOString(),
    location: "Austin, TX",
    coverUrl:
      "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&q=80",
    guestCount: 155,
  },
];

export async function scrapeOrFallback(
  eventIdOrUrl: string
): Promise<LumaEventData> {
  const eventId = normalizeEventId(eventIdOrUrl);

  try {
    return await scrapeLumaEvent(eventId);
  } catch {
    const fallback = FALLBACK_EVENTS.find((e) => e.id === eventId);
    if (!fallback) throw new Error(`Could not scrape event: ${eventId}`);

    return {
      eventId: fallback.id,
      slug: fallback.id,
      title: fallback.title,
      description:
        "Demo event used when live Luma scraping is unavailable. Form fields mirror a typical Luma registration.",
      startAt: fallback.startAt,
      endAt: null,
      timezone: "America/Los_Angeles",
      location: fallback.location,
      coverUrl: fallback.coverUrl,
      hosts: [{ name: "Illuminate Demo" }],
      guestCount: fallback.guestCount,
      isSoldOut: false,
      requiresApproval: false,
      ticketTypes: [{ id: "general", name: "General Admission", isFree: true }],
      formFields: [
        {
          id: "name",
          name: "name",
          label: "Full name",
          type: "text",
          required: true,
        },
        {
          id: "email",
          name: "email",
          label: "Email",
          type: "email",
          required: true,
        },
        {
          id: "company",
          name: "company",
          label: "Company",
          type: "text",
          required: false,
        },
        {
          id: "linkedin",
          name: "linkedin",
          label: "LinkedIn URL",
          type: "url",
          required: false,
        },
        {
          id: "why",
          name: "why",
          label: "Why do you want to attend?",
          type: "textarea",
          required: true,
        },
      ],
      csrfToken: `demo-csrf-${fallback.id}`,
      submitEndpoint: "https://api.lu.ma/event/independent/register",
      sourceUrl: `https://lu.ma/${fallback.id}`,
    };
  }
}
