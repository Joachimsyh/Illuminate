/** Fixed locale/timezone so SSR and client hydration always match. */
const EVENT_TZ = "Europe/London";
const EVENT_LOCALE = "en-GB";

export function formatEventWhen(
  iso: string | null | undefined,
  opts?: { withWeekday?: boolean }
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const withWeekday = opts?.withWeekday !== false;
  return new Intl.DateTimeFormat(EVENT_LOCALE, {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: EVENT_TZ,
  }).format(d);
}

export function formatDateTime(
  iso: string | null | undefined
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(EVENT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: EVENT_TZ,
  }).format(d);
}
