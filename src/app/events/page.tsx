import { EventsClient } from "./events-client";
import { discoverEvents } from "@/lib/luma-scraper";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q || "";
  const events = await discoverEvents(q || undefined);

  return <EventsClient initialEvents={events} initialQuery={q} />;
}
