import https from "https";
import { URL } from "url";
import * as ical from "node-ical";

function parseIcsBody(body: string): ReturnType<typeof ical.parseICS> {
  // ESM/CJS interop: Next may expose parseICS on root, .default, or .sync
  const mod = ical as typeof ical & {
    default?: typeof ical;
    sync?: { parseICS: typeof ical.parseICS };
  };
  const parse =
    mod.parseICS ||
    mod.sync?.parseICS ||
    mod.default?.parseICS ||
    mod.default?.sync?.parseICS;
  if (!parse) {
    throw new Error("node-ical parseICS is unavailable in this runtime");
  }
  return parse(body);
}

/** Accept Luma user ICS links; allow extra query params / fragments. */
export const LUMA_ICS_REGEX =
  /^https:\/\/api\.luma\.com\/ics\/get\?(?=.*(?:^|&)entity=user(?:&|$))(?=.*(?:^|&)id=icssk-[A-Za-z0-9_-]+)[^#\s]*$/i;

export type IcsEventPreview = {
  uid: string;
  title: string;
  start: string | null;
  end: string | null;
  location: string | null;
};

export function isValidLumaIcsUrl(url: string): boolean {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== "api.luma.com") return false;
    if (parsed.pathname !== "/ics/get") return false;
    if (parsed.searchParams.get("entity") !== "user") return false;
    const id = parsed.searchParams.get("id") || "";
    return /^icssk-[A-Za-z0-9_-]+$/i.test(id);
  } catch {
    return false;
  }
}

function shouldBypassTls(): boolean {
  return (
    process.env.SSL_NO_VERIFY === "1" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  );
}

function fetchText(
  url: string,
  bypassTls: boolean
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          Accept: "text/calendar, text/plain, */*",
          "User-Agent": "Illuminate/1.0",
        },
        rejectUnauthorized: !bypassTls,
        timeout: 20_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) =>
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
        );
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Calendar fetch timed out"));
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

function isTlsError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return (
    /certificate|SSL|TLS|UNABLE_TO_VERIFY|self.signed/i.test(message) ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  );
}

async function fetchTextWithFallback(
  url: string
): Promise<{ status: number; body: string }> {
  try {
    return await fetchText(url, shouldBypassTls());
  } catch (err) {
    // Local SSL interception (common on Windows): retry without verify
    if (isTlsError(err) && !shouldBypassTls()) {
      return await fetchText(url, true);
    }

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/calendar, text/plain, */*",
          "User-Agent": "Illuminate/1.0",
        },
        cache: "no-store",
      });
      return { status: response.status, body: await response.text() };
    } catch {
      throw err;
    }
  }
}

export async function fetchAndParseLumaIcs(url: string): Promise<{
  ok: boolean;
  error?: string;
  events: IcsEventPreview[];
}> {
  const trimmed = url.trim();
  if (!isValidLumaIcsUrl(trimmed)) {
    return {
      ok: false,
      error:
        "Link must look like https://api.luma.com/ics/get?entity=user&id=icssk-…",
      events: [],
    };
  }

  try {
    const { status, body } = await fetchTextWithFallback(trimmed);

    if (status < 200 || status >= 300) {
      return {
        ok: false,
        error: `Could not fetch calendar (HTTP ${status})`,
        events: [],
      };
    }

    if (!body.includes("BEGIN:VCALENDAR") && !body.includes("BEGIN:VEVENT")) {
      return {
        ok: false,
        error: "That URL did not return a valid iCal feed",
        events: [],
      };
    }

    const parsed = parseIcsBody(body);
    const events: IcsEventPreview[] = [];

    for (const value of Object.values(parsed)) {
      if (!value || typeof value !== "object") continue;
      const item = value as {
        type?: string;
        uid?: string;
        summary?: string;
        start?: Date;
        end?: Date;
        location?: string;
      };
      if (item.type !== "VEVENT") continue;

      const start =
        item.start instanceof Date ? item.start.toISOString() : null;
      const end = item.end instanceof Date ? item.end.toISOString() : null;

      events.push({
        uid: String(item.uid || `${item.summary}-${start}`),
        title: String(item.summary || "Untitled event"),
        start,
        end,
        location: item.location ? String(item.location) : null,
      });
    }

    events.sort((a, b) => {
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start.localeCompare(b.start);
    });

    // Empty calendar is still a valid connection
    return { ok: true, events };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse calendar";
    const isTls = /certificate|SSL|TLS|UNABLE_TO_VERIFY/i.test(message);
    return {
      ok: false,
      error: isTls
        ? "Could not fetch calendar (TLS/certificate error). Retry, or set SSL_NO_VERIFY=1 in .env.local"
        : message,
      events: [],
    };
  }
}
