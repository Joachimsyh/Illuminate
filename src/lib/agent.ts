import { listAgentUsers, findApplication, listApplications, findUserById } from "@/lib/repos";
import { discoverEventsForProfile } from "@/lib/luma-scraper";
import { autoApply } from "@/lib/auto-apply";
import { getAgentKnowledgeContext } from "@/lib/profile-knowledge";
import type { UserRow } from "@/lib/db-types";

export type AgentProgressEvent = {
  phase:
    | "started"
    | "user"
    | "knowledge"
    | "discovering"
    | "discovered"
    | "applying"
    | "result"
    | "finished"
    | "error";
  message: string;
  userId?: string;
  userName?: string | null;
  eventId?: string;
  eventTitle?: string;
  status?: string;
  index?: number;
  total?: number;
  attempted?: number;
  successes?: number;
  failures?: number;
  at: string;
};

export type AgentRunResult = {
  usersProcessed: number;
  applicationsAttempted: number;
  successes: number;
  failures: number;
  details: {
    userId: string;
    eventId: string;
    eventTitle?: string;
    status: string;
    message: string;
  }[];
};

export type RunAgentOptions = {
  /** When set, only process this user (dashboard "Run now"). */
  userId?: string;
  onProgress?: (event: AgentProgressEvent) => void | Promise<void>;
};

function parseJsonList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function now() {
  return new Date().toISOString();
}

async function emit(
  onProgress: RunAgentOptions["onProgress"],
  event: Omit<AgentProgressEvent, "at">
) {
  await onProgress?.({ ...event, at: now() });
}

async function processUser(
  user: UserRow,
  onProgress: RunAgentOptions["onProgress"],
  details: AgentRunResult["details"]
): Promise<{ attempted: number; successes: number; failures: number }> {
  let attempted = 0;
  let successes = 0;
  let failures = 0;

  await emit(onProgress, {
    phase: "user",
    message: `Working on ${user.name || user.email || "user"}…`,
    userId: user.id,
    userName: user.name,
  });

  await emit(onProgress, {
    phase: "knowledge",
    message: "Loading LinkedIn / knowledge graph…",
    userId: user.id,
    userName: user.name,
  });

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
    new Set([
      ...interests,
      ...knowledge.keywords.slice(0, 8),
      ...(user.agentKeywords || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ])
  );

  await emit(onProgress, {
    phase: "discovering",
    message: `Discovering events (${locations[0] || "any location"} · ${interestQuery.slice(0, 3).join(", ") || "keywords"})…`,
    userId: user.id,
  });

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

  const batch = matches.slice(0, 3);

  await emit(onProgress, {
    phase: "discovered",
    message:
      batch.length === 0
        ? "No new matching events to apply to."
        : `Found ${batch.length} event${batch.length === 1 ? "" : "s"} to try.`,
    userId: user.id,
    total: batch.length,
  });

  for (let i = 0; i < batch.length; i++) {
    const event = batch[i];
    const existing = await findApplication(user.id, event.id);
    if (
      existing?.status === "success" &&
      !existing.responseBody?.includes('"simulated":true')
    ) {
      details.push({
        userId: user.id,
        eventId: event.id,
        eventTitle: event.title,
        status: "already_applied",
        message: "Skipped — already registered",
      });
      await emit(onProgress, {
        phase: "result",
        message: `Skipped ${event.title} — already registered`,
        userId: user.id,
        eventId: event.id,
        eventTitle: event.title,
        status: "already_applied",
        index: i + 1,
        total: batch.length,
      });
      continue;
    }

    attempted += 1;
    await emit(onProgress, {
      phase: "applying",
      message: `Applying to ${event.title} (${i + 1}/${batch.length})…`,
      userId: user.id,
      eventId: event.id,
      eventTitle: event.title,
      index: i + 1,
      total: batch.length,
    });

    try {
      const result = await autoApply({
        userId: user.id,
        eventId: event.id,
      });
      details.push({
        userId: user.id,
        eventId: event.id,
        eventTitle: event.title,
        status: result.status,
        message: result.message,
      });
      if (result.success) successes += 1;
      else failures += 1;

      await emit(onProgress, {
        phase: "result",
        message: `${event.title}: ${result.status} — ${result.message}`,
        userId: user.id,
        eventId: event.id,
        eventTitle: event.title,
        status: result.status,
        index: i + 1,
        total: batch.length,
        attempted,
        successes,
        failures,
      });
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      details.push({
        userId: user.id,
        eventId: event.id,
        eventTitle: event.title,
        status: "failed",
        message,
      });
      await emit(onProgress, {
        phase: "result",
        message: `${event.title}: failed — ${message}`,
        userId: user.id,
        eventId: event.id,
        eventTitle: event.title,
        status: "failed",
        index: i + 1,
        total: batch.length,
        attempted,
        successes,
        failures,
      });
    }
  }

  return { attempted, successes, failures };
}

export async function runAgentCycle(
  options: RunAgentOptions = {}
): Promise<AgentRunResult> {
  const { userId, onProgress } = options;

  await emit(onProgress, {
    phase: "started",
    message: userId
      ? "Agent started for your account…"
      : "Agent started for all enabled accounts…",
  });

  let users: UserRow[] = [];
  if (userId) {
    const one = await findUserById(userId);
    if (one) users = [one];
  } else {
    users = await listAgentUsers();
  }

  if (users.length === 0) {
    await emit(onProgress, {
      phase: "finished",
      message: userId
        ? "No user found to run."
        : "No agent-enabled users. Turn on Enable agent and save first.",
      attempted: 0,
      successes: 0,
      failures: 0,
    });
    return {
      usersProcessed: 0,
      applicationsAttempted: 0,
      successes: 0,
      failures: 0,
      details: [],
    };
  }

  const details: AgentRunResult["details"] = [];
  let applicationsAttempted = 0;
  let successes = 0;
  let failures = 0;

  for (const user of users) {
    try {
      const r = await processUser(user, onProgress, details);
      applicationsAttempted += r.attempted;
      successes += r.successes;
      failures += r.failures;
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      await emit(onProgress, {
        phase: "error",
        message: `User run failed: ${message}`,
        userId: user.id,
        userName: user.name,
      });
    }
  }

  await emit(onProgress, {
    phase: "finished",
    message: `Done — ${successes} success / ${failures} other / ${applicationsAttempted} attempted`,
    attempted: applicationsAttempted,
    successes,
    failures,
  });

  return {
    usersProcessed: users.length,
    applicationsAttempted,
    successes,
    failures,
    details,
  };
}
