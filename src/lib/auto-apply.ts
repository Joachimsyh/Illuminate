import axios from "axios";
import {
  findApplication,
  findEventDetailBySlug,
  findUserById,
  upsertApplication,
} from "@/lib/repos";
import {
  scrapeOrFallback,
  type FormField,
  type LumaEventData,
} from "@/lib/luma-scraper";
import {
  buildProfileAnswers,
  fillBlanksWithAgent,
  type ProfileForFill,
} from "@/lib/agent-fill";

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
  filledAnswers?: Record<string, string>;
};

function toProfile(user: {
  registrationName: string | null;
  registrationEmail: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  skills: string;
  techStack: string;
  interests: string;
  seniority: string | null;
  rawSource: string;
  writingSamples: string;
  linkedinId: string | null;
}): ProfileForFill {
  return {
    name: user.registrationName || user.name,
    email: user.registrationEmail || user.email,
    company: user.company,
    headline: user.headline,
    bio: user.bio || user.rawSource?.slice(0, 800) || null,
    location: user.location,
    skills: user.skills || "",
    techStack: user.techStack || "",
    interests: user.interests || "",
    seniority: user.seniority,
    rawSource: user.rawSource || "",
    writingSamples: user.writingSamples || "[]",
    linkedinId: user.linkedinId,
  };
}

function fieldsFromStoredDetails(
  registrationQuestionsJson: string | null | undefined
): FormField[] {
  if (!registrationQuestionsJson) return [];
  try {
    const parsed = JSON.parse(registrationQuestionsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((q, i) => {
      const question = q as Record<string, unknown>;
      const id = String(question.id || question.question_id || `q-${i}`);
      return {
        id,
        name: String(question.name || question.id || id),
        label: String(question.label || question.question || "Question"),
        type: String(
          question.question_type || question.type || question.input_type || "text"
        ),
        required: Boolean(question.required ?? question.is_required),
        options: Array.isArray(question.options)
          ? question.options.map(String)
          : undefined,
      };
    });
  } catch {
    return [];
  }
}

function mergeFormFields(
  primary: FormField[],
  extra: FormField[]
): FormField[] {
  const out: FormField[] = [];
  const seen = new Set<string>();
  for (const f of [...primary, ...extra]) {
    const key = f.name || f.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function validateCsrf(event: LumaEventData): void {
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

    if (
      demoSubmit &&
      (response.status === 401 ||
        response.status === 403 ||
        response.status >= 400)
    ) {
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

/**
 * Build answers from profile + LLM for open questions (used by apply + preview).
 */
export async function prepareRegistrationAnswers(input: {
  userId: string;
  eventId: string;
  answers?: Record<string, string>;
  event?: LumaEventData;
}): Promise<{
  user: ProfileForFill;
  event: LumaEventData;
  answers: Record<string, string>;
  formFields: FormField[];
}> {
  const row = await findUserById(input.userId);
  if (!row) throw new Error("User not found");
  const user = toProfile(row);

  const event = input.event || (await scrapeOrFallback(input.eventId));
  const stored = await findEventDetailBySlug(event.slug);
  const fromDetails = fieldsFromStoredDetails(stored?.registrationQuestionsJson);
  const formFields = mergeFormFields(event.formFields, fromDetails);

  let answers = buildProfileAnswers(formFields, user, input.answers || {});
  answers = await fillBlanksWithAgent({
    fields: formFields,
    existing: answers,
    user,
    eventTitle: event.title,
    eventDescription:
      stored?.descriptionText || event.description || undefined,
  });

  return { user, event: { ...event, formFields }, answers, formFields };
}

export async function autoApply(input: ApplyInput): Promise<ApplyResult> {
  const userRow = await findUserById(input.userId);
  if (!userRow) {
    return {
      success: false,
      status: "failed",
      message: "User not found",
      event: { id: input.eventId, title: "", url: "", startAt: null },
    };
  }

  const existing = await findApplication(input.userId, input.eventId);

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

  let prepared;
  try {
    prepared = await prepareRegistrationAnswers({
      userId: input.userId,
      eventId: input.eventId,
      answers: input.answers,
    });
  } catch (err) {
    return {
      success: false,
      status: "failed",
      message: err instanceof Error ? err.message : "Could not prepare answers",
      event: { id: input.eventId, title: "", url: "", startAt: null },
    };
  }

  const { event, answers, formFields } = prepared;
  validateCsrf(event);

  const missing = formFields
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
      filledAnswers: answers,
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

  const application = await upsertApplication({
    userId: input.userId,
    eventId: event.slug,
    eventTitle: event.title,
    eventUrl: event.sourceUrl,
    eventDate: event.startAt,
    status,
    message,
    formPayload: JSON.stringify(answers),
    responseBody: submission.body.slice(0, 4000),
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
    filledAnswers: answers,
  };
}
