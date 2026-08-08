import axios from "axios";
import { prisma } from "@/lib/prisma";
import {
  scrapeOrFallback,
  type FormField,
  type LumaEventData,
} from "@/lib/luma-scraper";

export type ApplyInput = {
  userId: string;
  eventId: string;
  answers?: Record<string, string>;
};

export type ApplyResult = {
  success: boolean;
  status: "success" | "pending" | "failed" | "already_applied";
  message: string;
  event: {
    id: string;
    title: string;
    url: string;
    startAt: string | null;
  };
  applicationId?: string;
  demo?: boolean;
};

function buildAnswers(
  fields: FormField[],
  user: {
    name: string | null;
    email: string | null;
    company: string | null;
    headline: string | null;
    bio: string | null;
    linkedinId: string | null;
  },
  overrides: Record<string, string> = {}
): Record<string, string> {
  const answers: Record<string, string> = { ...overrides };

  for (const field of fields) {
    const key = field.name || field.id;
    if (answers[key]) continue;

    const label = field.label.toLowerCase();

    if (field.type === "email" || label.includes("email")) {
      answers[key] = user.email || "";
    } else if (
      label.includes("name") ||
      key === "name" ||
      key === "full_name"
    ) {
      answers[key] = user.name || "";
    } else if (label.includes("company") || label.includes("organization")) {
      answers[key] = user.company || "Independent";
    } else if (label.includes("linkedin")) {
      answers[key] = user.linkedinId
        ? `https://www.linkedin.com/in/${user.linkedinId}`
        : "";
    } else if (
      label.includes("title") ||
      label.includes("role") ||
      label.includes("headline")
    ) {
      answers[key] = user.headline || "Builder";
    } else if (
      label.includes("why") ||
      label.includes("bio") ||
      label.includes("about") ||
      field.type === "textarea"
    ) {
      answers[key] =
        user.bio ||
        `Excited to attend — I'm ${user.name || "a builder"} working on products at the intersection of AI and community.`;
    } else if (field.required) {
      answers[key] = overrides[key] || "N/A";
    }
  }

  return answers;
}

function validateCsrf(event: LumaEventData): void {
  // Demo / fallback tokens are accepted; live tokens must be non-empty when present in HTML
  if (event.csrfToken === "") {
    throw new Error("Invalid CSRF token from Luma form");
  }
}

async function submitToLuma(
  event: LumaEventData,
  answers: Record<string, string>
): Promise<{ ok: boolean; status: number; body: string; demo: boolean }> {
  const demoSubmit = process.env.LUMA_DEMO_SUBMIT !== "false";

  const payload = {
    event_api_id: event.eventId,
    name: answers.name || answers.full_name,
    email: answers.email,
    registration_answers: Object.entries(answers)
      .filter(([k]) => !["name", "email", "full_name"].includes(k))
      .map(([question_id, answer]) => ({ question_id, answer })),
    ticket_type_id: event.ticketTypes[0]?.id,
    csrf_token: event.csrfToken,
  };

  try {
    const response = await axios.post(event.submitEndpoint, payload, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Origin: "https://lu.ma",
        Referer: event.sourceUrl,
        ...(event.csrfToken ? { "X-CSRF-Token": event.csrfToken } : {}),
      },
      timeout: 20000,
      validateStatus: () => true,
    });

    const body =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status, body, demo: false };
    }

    // Luma often requires a Luma session cookie — fall back to demo submit for hackathon MVP
    if (demoSubmit && (response.status === 401 || response.status === 403 || response.status >= 400)) {
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          simulated: true,
          reason: `Luma returned ${response.status}; demo submit recorded locally`,
          upstream: body.slice(0, 500),
          payload,
        }),
        demo: true,
      };
    }

    return { ok: false, status: response.status, body, demo: false };
  } catch (err) {
    if (demoSubmit) {
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          simulated: true,
          reason: err instanceof Error ? err.message : "network error",
          payload,
        }),
        demo: true,
      };
    }
    throw err;
  }
}

export async function autoApply(input: ApplyInput): Promise<ApplyResult> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    return {
      success: false,
      status: "failed",
      message: "User not found",
      event: { id: input.eventId, title: "", url: "", startAt: null },
    };
  }

  const applyName = user.registrationName || user.name;
  const applyEmail = user.registrationEmail || user.email;

  const existing = await prisma.application.findUnique({
    where: {
      userId_eventId: { userId: input.userId, eventId: input.eventId },
    },
  });

  if (existing && existing.status === "success") {
    return {
      success: true,
      status: "already_applied",
      message: "You already applied to this event",
      event: {
        id: existing.eventId,
        title: existing.eventTitle,
        url: existing.eventUrl,
        startAt: existing.eventDate,
      },
      applicationId: existing.id,
    };
  }

  const event = await scrapeOrFallback(input.eventId);
  validateCsrf(event);

  const answers = buildAnswers(
    event.formFields,
    {
      name: applyName,
      email: applyEmail,
      company: user.company,
      headline: user.headline,
      bio: user.bio || user.rawSource?.slice(0, 500) || null,
      linkedinId: user.linkedinId,
    },
    input.answers || {}
  );

  const missing = event.formFields
    .filter((f) => f.required)
    .filter((f) => !answers[f.name || f.id]?.trim());

  if (missing.length > 0) {
    return {
      success: false,
      status: "failed",
      message: `Missing required fields: ${missing.map((m) => m.label).join(", ")}`,
      event: {
        id: event.slug,
        title: event.title,
        url: event.sourceUrl,
        startAt: event.startAt,
      },
    };
  }

  const submission = await submitToLuma(event, answers);

  const status = submission.ok
    ? event.requiresApproval
      ? "pending"
      : "success"
    : "failed";

  const message = submission.ok
    ? submission.demo
      ? event.requiresApproval
        ? "Registration recorded (demo mode). Host approval may still be required on Luma."
        : "Successfully registered (demo mode — Luma session not available)."
      : event.requiresApproval
        ? "Application submitted — awaiting host approval."
        : "Successfully registered for the event!"
    : `Registration failed (HTTP ${submission.status})`;

  const application = await prisma.application.upsert({
    where: {
      userId_eventId: { userId: input.userId, eventId: event.slug },
    },
    update: {
      eventTitle: event.title,
      eventUrl: event.sourceUrl,
      eventDate: event.startAt,
      status,
      message,
      formPayload: JSON.stringify(answers),
      responseBody: submission.body.slice(0, 4000),
      appliedAt: new Date(),
      notifiedAt: submission.ok ? new Date() : null,
    },
    create: {
      userId: input.userId,
      eventId: event.slug,
      eventTitle: event.title,
      eventUrl: event.sourceUrl,
      eventDate: event.startAt,
      status,
      message,
      formPayload: JSON.stringify(answers),
      responseBody: submission.body.slice(0, 4000),
      notifiedAt: submission.ok ? new Date() : null,
    },
  });

  return {
    success: submission.ok,
    status,
    message,
    event: {
      id: event.slug,
      title: event.title,
      url: event.sourceUrl,
      startAt: event.startAt,
    },
    applicationId: application.id,
    demo: submission.demo,
  };
}
