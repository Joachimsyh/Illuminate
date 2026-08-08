import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const [applications, user] = await Promise.all([
    prisma.application.findMany({
      where: { userId: session.user.id },
      orderBy: { appliedAt: "desc" },
      take: 20,
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        agentEnabled: true,
        agentKeywords: true,
        headline: true,
        company: true,
        bio: true,
        location: true,
        skills: true,
        onboardingCompleted: true,
      },
    }),
  ]);

  if (!user?.onboardingCompleted) redirect("/onboarding");

  const stats = {
    total: applications.length,
    success: applications.filter((a) => a.status === "success").length,
    pending: applications.filter((a) => a.status === "pending").length,
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
      applications={applications.map((a) => ({
        id: a.id,
        eventId: a.eventId,
        eventTitle: a.eventTitle,
        eventUrl: a.eventUrl,
        eventDate: a.eventDate,
        status: a.status,
        message: a.message,
        appliedAt: a.appliedAt.toISOString(),
      }))}
      eventsHref="/events"
    />
  );
}
