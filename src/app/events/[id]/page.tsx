import Link from "next/link";
import { scrapeOrFallback } from "@/lib/luma-scraper";
import { EventDetailClient } from "./event-detail-client";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const event = await scrapeOrFallback(params.id);
    return (
      <EventDetailClient
        event={{
          ...event,
          hosts: event.hosts,
          formFields: event.formFields,
          ticketTypes: event.ticketTypes,
        }}
      />
    );
  } catch {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="font-display text-3xl text-mist-100">Event not found</h1>
        <p className="mt-2 text-mist-400">
          Could not scrape <code>{params.id}</code> from lu.ma
        </p>
        <Link
          href="/events"
          className="mt-6 inline-block text-lumen-300 underline"
        >
          Back to events
        </Link>
      </div>
    );
  }
}
