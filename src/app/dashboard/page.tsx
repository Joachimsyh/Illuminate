import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { findUserById, listApplications } from "@/lib/repos";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const [allApplications, user] = await Promise.all([
    listApplications(session.user.id),
    findUserById(session.user.id),
  ]);
  const applications = allApplications.slice(0, 20);

  if (!user?.onboardingCompleted) redirect("/onboarding");

  const stats = {
    total: applications.length,
    success: applications.filter((a) => a.status === "success").length,
    pending: applications.filter(
      (a) => a.status === "pending" || a.status === "needs_verification"
    ).length,
    failed: applications.filter((a) => a.status === "failed").length,
  };

  return (
    <DashboardClient
      user={{
        name: session.user.name || "Builder",
        email: session.user.email || "",
        image: session.user.image || null,
        headline: user?.headline || session.user.headline || null,
        company: user?.company || null,
        bio: user?.bio || null,
        location: user?.location || null,
        agentEnabled: user?.agentEnabled ?? false,
        agentKeywords: user?.agentKeywords || "ai,hackathon,startup",
        skills: user?.skills ? user.skills.split("|").filter(Boolean) : [],
      }}
      stats={stats}
      applications={applications.map((a) => {
        let answers: Record<string, string> | null = null;
        if (a.formPayload) {
          try {
            const parsed = JSON.parse(a.formPayload) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              answers = Object.fromEntries(
                Object.entries(parsed as Record<string, unknown>).map(
                  ([k, v]) => [k, v == null ? "" : String(v)]
                )
              );
            }
          } catch {
            answers = null;
          }
        }
        return {
          id: a.id,
          eventId: a.eventId,
          eventTitle: a.eventTitle,
          eventUrl: a.eventUrl,
          eventDate: a.eventDate,
          status: a.status,
          message: a.message,
          appliedAt: a.appliedAt.toISOString(),
          answers,
        };
      })}
      eventsHref="/events"
    />
  );
}
