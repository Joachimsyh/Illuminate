import { prisma } from "@/lib/prisma";
import { discoverEventsForProfile } from "@/lib/luma-scraper";
import { autoApply } from "@/lib/auto-apply";

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

export async function runAgentCycle(): Promise<AgentRunResult> {
  const users = await prisma.user.findMany({
    where: { agentEnabled: true },
  });

  const details: AgentRunResult["details"] = [];
  let applicationsAttempted = 0;
  let successes = 0;
  let failures = 0;

  for (const user of users) {
    const locations = (user.location || "").split("|").filter(Boolean);
    const interests = (user.interests || "").split("|").filter(Boolean);
    const matches = (
      await discoverEventsForProfile({
        locations,
        interests,
        limit: 10,
      })
    ).events;

    for (const event of matches.slice(0, 3)) {
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
