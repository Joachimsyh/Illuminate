"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Shield,
  Ticket,
  Users,
} from "lucide-react";
import { FadeIn } from "@/components/motion";
import { LumaRegistrationForm } from "@/components/luma-registration-form";
import { formatDateTime } from "@/lib/format-date";
import type { FormField } from "@/lib/luma-scraper";

type EventView = {
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
  sourceUrl: string;
};

export function EventDetailClient({
  event,
  filledAnswers = {},
}: {
  event: EventView;
  filledAnswers?: Record<string, string>;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <FadeIn>
        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 text-sm text-mist-400 transition hover:text-mist-100"
        >
          <ArrowLeft className="h-4 w-4" />
          All events
        </Link>
      </FadeIn>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.35fr_0.75fr]">
        <div>
          <FadeIn>
            <div className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
              <motion.div
                initial={{ scale: 1.08 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                className="relative h-64 sm:h-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    event.coverUrl ||
                    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1400&q=80"
                  }
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
              </motion.div>
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                <h1 className="font-display text-3xl tracking-tight text-white sm:text-4xl text-balance">
                  {event.title}
                </h1>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-mist-200">
                  {event.startAt && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-lumen-300" />
                      {formatDateTime(event.startAt)}
                      {event.timezone ? ` (${event.timezone})` : ""}
                    </span>
                  )}
                  {event.location && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-lumen-300" />
                      {event.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-lumen-300" />
                    {event.guestCount} guests
                  </span>
                </div>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.12}>
            <section className="mt-8">
              <h2 className="font-display text-xl text-mist-100">About</h2>
              <p className="mt-3 whitespace-pre-wrap text-mist-300 leading-relaxed">
                {event.description || "No description available."}
              </p>
            </section>
          </FadeIn>

          <FadeIn delay={0.18}>
            <section className="mt-8">
              {event.isSoldOut ? (
                <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
                  This event appears sold out on Luma.
                </div>
              ) : (
                <LumaRegistrationForm
                  eventId={event.slug}
                  fields={event.formFields}
                  initialAnswers={filledAnswers}
                />
              )}
            </section>
          </FadeIn>
        </div>

        <FadeIn delay={0.1}>
          <aside className="glass sticky top-24 space-y-5 rounded-3xl p-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-mist-400">
                From your LinkedIn profile
              </p>
              <h2 className="mt-1 font-display text-2xl text-mist-100">
                Review & submit
              </h2>
              <p className="mt-2 text-sm text-mist-400">
                Name and email come from LinkedIn / onboarding. Other answers
                are drafted from your profile — edit the form on the left, then
                submit.
              </p>
            </div>

            <ul className="space-y-2.5 text-sm text-mist-300">
              <li className="flex items-start gap-2">
                <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-lumen-300" />
                {event.ticketTypes[0]
                  ? `${event.ticketTypes[0].name}${
                      event.ticketTypes[0].isFree
                        ? " · Free"
                        : event.ticketTypes[0].price
                          ? ` · ${event.ticketTypes[0].currency || "$"}${event.ticketTypes[0].price}`
                          : ""
                    }`
                  : "General admission"}
              </li>
              {event.requiresApproval && (
                <li className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-lumen-300" />
                  Host approval required after submit
                </li>
              )}
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-lumen-300" />
                {event.formFields.length} Luma form field
                {event.formFields.length === 1 ? "" : "s"} scraped
              </li>
            </ul>

            {event.hosts.length > 0 && (
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs uppercase tracking-wider text-mist-400">
                  Hosts
                </p>
                <ul className="mt-2 space-y-2">
                  {event.hosts.map((h) => (
                    <li key={h.name} className="text-sm text-mist-200">
                      {h.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-mist-400 underline-offset-4 hover:text-mist-200 hover:underline"
            >
              Open original on Luma
            </a>
          </aside>
        </FadeIn>
      </div>
    </div>
  );
}
