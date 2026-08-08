import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prepareRegistrationAnswers } from "@/lib/auto-apply";
import { buildProfileAnswers } from "@/lib/agent-fill";
import { findUserById } from "@/lib/repos";
import { scrapeOrFallback } from "@/lib/luma-scraper";
import { EventDetailClient } from "./event-detail-client";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const session = await getSession();
    const event = await scrapeOrFallback(params.id);

    let filledAnswers: Record<string, string> = {};
    let formFields = event.formFields;

    if (session?.user?.id) {
      try {
        // Full agent fill (profile + LLM) so the page shows real drafts
        const prepared = await prepareRegistrationAnswers({
          userId: session.user.id,
          eventId: params.id,
          event,
          // Prefill must be fast — LLM drafts happen only when applying without answers.
          skipLlm: true,
        });
        filledAnswers = prepared.answers;
        formFields = prepared.formFields;
      } catch {
        // Fast heuristic preview if LLM is unavailable
        const user = await findUserById(session.user.id);
        if (user) {
          filledAnswers = buildProfileAnswers(event.formFields, {
            name: user.registrationName || user.name,
            email: user.registrationEmail || user.email,
            company: user.company,
            headline: user.headline,
            bio: user.bio,
            location: user.location,
            skills: user.skills,
            techStack: user.techStack,
            interests: user.interests,
            seniority: user.seniority,
            rawSource: user.rawSource,
            writingSamples: user.writingSamples,
            linkedinId: user.linkedinId,
            agentSummary: user.bio,
          });
        }
      }
    }

    return (
      <EventDetailClient
        event={{
          ...event,
          formFields,
          hosts: event.hosts,
          ticketTypes: event.ticketTypes,
        }}
        filledAnswers={filledAnswers}
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
