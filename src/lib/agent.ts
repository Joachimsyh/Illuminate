import { listAgentUsers, findApplication, listApplications } from "@/lib/repos";
import { discoverEventsForProfile } from "@/lib/luma-scraper";
import { autoApply } from "@/lib/auto-apply";
import { getAgentKnowledgeContext } from "@/lib/profile-knowledge";

export type AgentRunResult = {
  usersProcessed: number;
  applicationsAttempted: number;
  successes: number;
  failures: number;
  details: {
    userId: string;
    eventId: string;
    status: string;
    message: string;
  }[];
};

function parseJsonList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function runAgentCycle(): Promise<AgentRunResult> {
  const users = await listAgentUsers();

  const details: AgentRunResult["details"] = [];
  let applicationsAttempted = 0;
  let successes = 0;
  let failures = 0;

  for (const user of users) {
    const knowledge = await getAgentKnowledgeContext(user.id);
    const locations =
      knowledge.locations.length > 0
        ? knowledge.locations
        : parseJsonList(knowledge.profile?.locationsJson).length > 0
          ? parseJsonList(knowledge.profile?.locationsJson)
          : (user.location || "").split("|").filter(Boolean);
    const interests =
      knowledge.interests.length > 0
        ? knowledge.interests
        : parseJsonList(knowledge.profile?.interestsJson).length > 0
          ? parseJsonList(knowledge.profile?.interestsJson)
          : (user.interests || "").split("|").filter(Boolean);
    const interestQuery = Array.from(
      new Set([...interests, ...knowledge.keywords.slice(0, 8)])
    );

    const prior = await listApplications(user.id);
    const alreadyLiveSuccess = new Set(
      prior
        .filter(
          (a) =>
            a.status === "success" &&
            !a.responseBody?.includes('"simulated":true') &&
            !a.message?.toLowerCase().includes("demo mode")
        )
        .map((a) => a.eventId)
    );

    const matches = (
      await discoverEventsForProfile({
        locations,
        interests: interestQuery,
        limit: 10,
      })
    ).events.filter((e) => !alreadyLiveSuccess.has(e.id));

    for (const event of matches.slice(0, 3)) {
      const existing = await findApplication(user.id, event.id);
      if (
        existing?.status === "success" &&
        !existing.responseBody?.includes('"simulated":true')
      ) {
        details.push({
          userId: user.id,
          eventId: event.id,
          status: "already_applied",
          message: "Skipped — already registered",
        });
        continue;
      }

      applicationsAttempted += 1;
      try {
        const result = await autoApply({
          userId: user.id,
          eventId: event.id,
        });
        details.push({
          userId: user.id,
          eventId: event.id,
          status: result.status,
          message: result.message,
        });
        if (result.success) successes += 1;
        else failures += 1;
      } catch (err) {
        failures += 1;
        details.push({
          userId: user.id,
          eventId: event.id,
          status: "failed",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return {
    usersProcessed: users.length,
    applicationsAttempted,
    successes,
    failures,
    details,
  };
}
