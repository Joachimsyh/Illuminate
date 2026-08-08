"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, RefreshCw, Sparkles, Users } from "lucide-react";
import { FadeIn, MagneticButton, Stagger, StaggerItem } from "@/components/motion";

type EventItem = {
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

export function EventsClient({
  initialEvents,
  locations,
  interests,
  initialError,
}: {
  initialEvents: EventItem[];
  locations: string[];
  interests: string[];
  initialError?: string | null;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(initialError || null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/events?refresh=1");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const cmds = Array.isArray(data.commands)
            ? data.commands.join("\n")
            : data.error || "Unknown failure";
          setError(data.error || `Refresh failed.\n${cmds}`);
          return;
        }
        setEvents(data.events || []);
        if (data.warning) setWarning(data.warning);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Network error while refreshing"
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <FadeIn>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-lumen-300/80">
              For you
            </p>
            <h1 className="mt-2 font-display text-4xl tracking-tight text-mist-100 sm:text-5xl">
              Closest matching events
            </h1>
            <p className="mt-2 max-w-xl text-mist-300">
              Live from Luma city & topic pages for your locations and interests.
            </p>
          </div>
          <MagneticButton
            onClick={refresh}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-mist-100 ring-1 ring-white/15 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
            />
            {isPending ? "Refreshing…" : "Refresh real events"}
          </MagneticButton>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {locations.map((loc) => (
            <span
              key={loc}
              className="inline-flex items-center gap-1 rounded-full bg-lumen-400/15 px-3 py-1.5 text-xs text-lumen-200"
            >
              <MapPin className="h-3 w-3" />
              {loc}
            </span>
          ))}
          {interests.map((topic) => (
            <span
              key={topic}
              className="inline-flex items-center gap-1 rounded-full bg-sky-400/15 px-3 py-1.5 text-xs text-sky-200"
            >
              <Sparkles className="h-3 w-3" />
              {topic}
            </span>
          ))}
          {!locations.length && !interests.length && (
            <span className="text-xs text-mist-400">
              No preferences yet — update them on your{" "}
              <Link href="/profile" className="text-lumen-300 underline">
                profile
              </Link>
              .
            </span>
          )}
        </div>
      </FadeIn>

      {error && (
        <div className="mt-6 rounded-2xl bg-rose-500/10 p-4 ring-1 ring-rose-400/30">
          <p className="text-sm font-medium text-rose-200">Refresh failed</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-ink-950/60 p-3 text-[11px] leading-relaxed text-rose-100/90">
            {error}
          </pre>
        </div>
      )}

      {warning && !error && (
        <div className="mt-6 rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-400/25">
          <p className="text-sm font-medium text-amber-100">Partial feed warning</p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-ink-950/60 p-3 text-[11px] text-amber-100/90">
            {warning}
          </pre>
        </div>
      )}

      <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
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
                <div className="glass relative -mt-8 px-5 pb-5 pt-2">
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
                  {(event.matchedTopics?.length ||
                    event.matchedLocations?.length) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {event.matchedLocations?.slice(0, 2).map((loc) => (
                        <span
                          key={loc}
                          className="rounded-full bg-lumen-400/10 px-2 py-0.5 text-[10px] text-lumen-200"
                        >
                          {loc}
                        </span>
                      ))}
                      {event.matchedTopics?.slice(0, 2).map((topic) => (
                        <span
                          key={topic}
                          className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] text-sky-200"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.article>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      {events.length === 0 && !error && (
        <p className="mt-16 text-center text-mist-400">
          No matching events right now. Hit refresh or update your preferences
          on your profile.
        </p>
      )}
    </div>
  );
}
