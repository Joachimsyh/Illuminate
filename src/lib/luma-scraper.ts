import * as cheerio from "cheerio";
import axios from "axios";

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

/**
 * Discover events by GETting luma.com city/topic pages, inserting new rows
 * into the Event table (existing slugs are discarded), then reading from DB.
 */
export async function discoverEventsForProfile(input: {
  locations?: string[];
  interests?: string[];
  limit?: number;
  mode?: "match" | "all";
}): Promise<DiscoverResult & { added?: number; skipped?: number }> {
  const { discoverEventsFromWebsite } = await import("@/lib/luma-page-scrape");
  const result = await discoverEventsFromWebsite(input);
  return {
    events: result.events,
    attempts: result.attempts.map((a) => ({
      label: a.label,
      url: a.url,
      command: a.command,
      ok: a.ok,
      status: a.status,
      count: a.count,
      error: a.error,
    })),
    ok: result.ok,
    error: result.error,
    added: result.added,
    skipped: result.skipped,
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
