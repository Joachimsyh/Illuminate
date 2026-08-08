"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MapPin, Search, Users } from "lucide-react";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";

type EventItem = {
  id: string;
  title: string;
  startAt: string | null;
  location: string | null;
  coverUrl: string | null;
  url: string;
  guestCount: number;
};

export function EventsClient({
  initialEvents,
  initialQuery,
}: {
  initialEvents: EventItem[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  function onSearch(e: FormEvent) {
    e.preventDefault();
    startTransition(() => {
      router.push(query ? `/events?q=${encodeURIComponent(query)}` : "/events");
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <FadeIn>
        <p className="text-sm uppercase tracking-[0.2em] text-lumen-300/80">
          Discover
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight text-mist-100 sm:text-5xl">
          Public Luma events
        </h1>
        <p className="mt-2 max-w-xl text-mist-300">
          Scraped from public lu.ma pages — no API key. Paste a slug or search
          by city / topic.
        </p>
      </FadeIn>

      <FadeIn delay={0.1} className="mt-8">
        <form
          onSubmit={onSearch}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search AI, hackathon, SF… or paste an event slug"
              className="w-full rounded-2xl border border-white/10 bg-ink-900/70 py-3.5 pl-10 pr-4 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
            />
          </div>
          <button
            type="submit"
            className="rounded-2xl bg-lumen-400 px-6 py-3.5 text-sm font-semibold text-ink-950"
          >
            {isPending ? "Searching…" : "Search"}
          </button>
        </form>

        <p className="mt-3 text-xs text-mist-400">
          Tip: open{" "}
          <Link href="/events/monad-blitz" className="text-lumen-300 underline">
            /events/monad-blitz
          </Link>{" "}
          or any live slug like{" "}
          <code className="rounded bg-white/5 px-1">/events/your-event-id</code>
        </p>
      </FadeIn>

      <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {initialEvents.map((event) => (
          <StaggerItem key={event.id}>
            <Link href={`/events/${event.id}`} className="group block">
              <motion.article
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="overflow-hidden rounded-3xl ring-1 ring-white/10"
              >
                <div className="relative h-40 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      event.coverUrl ||
                      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80"
                    }
                    alt=""
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
                </div>
                <div className="glass -mt-8 relative px-5 pb-5 pt-2">
                  <h2 className="font-display text-lg leading-snug text-mist-100 group-hover:text-lumen-200">
                    {event.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-mist-400">
                    {event.startAt && (
                      <span>
                        {new Date(event.startAt).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {event.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {event.guestCount}
                    </span>
                  </div>
                </div>
              </motion.article>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      {initialEvents.length === 0 && (
        <p className="mt-16 text-center text-mist-400">
          No events matched. Try another query or open a specific event ID.
        </p>
      )}
    </div>
  );
}
