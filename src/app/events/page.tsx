import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { findUserById } from "@/lib/repos";
import { discoverEventsForProfile } from "@/lib/luma-scraper";
import { EventsClient } from "./events-client";

export const dynamic = "force-dynamic";

function splitPipe(value: string | null | undefined): string[] {
  return value ? value.split("|").filter(Boolean) : [];
}

export default async function EventsPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const user = await findUserById(session.user.id);
  if (!user) redirect("/login");

  const locations = splitPipe(user.location);
  const interests = splitPipe(user.interests);

  const result = await discoverEventsForProfile({
    locations,
    interests,
    limit: 10,
    mode: "match",
  });

  return (
    <EventsClient
      initialEvents={result.events}
      locations={locations}
      interests={interests}
      initialError={result.ok ? result.error : result.error}
    />
  );
}
