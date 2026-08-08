import { prisma } from "@/lib/prisma";
import { discoverEvents } from "@/lib/luma-scraper";
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

  const events = await discoverEvents();
  const details: AgentRunResult["details"] = [];
  let applicationsAttempted = 0;
  let successes = 0;
  let failures = 0;

  for (const user of users) {
    const keywords = (user.agentKeywords || "")
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const matches = events.filter((event) => {
      if (keywords.length === 0) return true;
      const hay = `${event.title} ${event.location || ""}`.toLowerCase();
      return keywords.some((k) => hay.includes(k));
    });

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
