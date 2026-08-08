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
import { extractLinkedInSocials } from "@/lib/linkedin-socials";
import { getAgentKnowledgeContext } from "@/lib/profile-knowledge";
import { findUserProfile } from "@/lib/knowledge-repos";
import { browserAssistLumaApply } from "@/lib/luma-browser-apply";

export type ApplyInput = {
  userId: string;
  eventId: string;
  answers?: Record<string, string>;
  /** Skip server POST and open headed Playwright for captcha. */
  browserAssist?: boolean;
};

export type ApplyResult = {
  success: boolean;
  status:
    | "success"
    | "pending"
    | "failed"
    | "already_applied"
    | "needs_verification"
    | "paid_manual";
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
  lumaUrl?: string;
  /** Client can call apply again with browserAssist: true */
  browserAssistAvailable?: boolean;
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

async function profileFromStored(userId: string, fallback: ProfileForFill) {
  const stored = await findUserProfile(userId);
  if (!stored) {
    return {
      ...fallback,
      socials: extractLinkedInSocials(fallback.rawSource || ""),
    };
  }
  const parse = (raw: string) => {
    try {
      const v = JSON.parse(raw || "[]");
      return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  const socials = extractLinkedInSocials(stored.rawSource || fallback.rawSource || "");
  return {
    ...fallback,
    headline: stored.headline || fallback.headline,
    bio: stored.agentSummary || stored.bio || fallback.bio,
    company: stored.company || fallback.company,
    seniority: stored.seniority || fallback.seniority,
    skills: parse(stored.skillsJson).join("|") || fallback.skills,
    techStack: parse(stored.techStackJson).join("|") || fallback.techStack,
    interests: parse(stored.interestsJson).join("|") || fallback.interests,
    location: parse(stored.locationsJson).join("|") || fallback.location,
    rawSource: stored.rawSource || fallback.rawSource,
    agentSummary: stored.agentSummary || fallback.bio,
    placeOfWorkStudy: stored.placeOfWorkStudy,
    lifeStatus: stored.lifeStatus,
    socials,
  } satisfies ProfileForFill;
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
        questionType: String(
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
  // Live Luma register no longer requires a scraped CSRF token.
  // Keep a soft check for demo fallbacks that set empty-string CSRF.
  if (event.csrfToken === "") {
    throw new Error("Invalid CSRF token from Luma form");
  }
}

function splitName(full: string): { name: string; first: string; last: string } {
  const name = full.trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: "", first: "", last: "" };
  if (parts.length === 1) return { name, first: parts[0], last: "" };
  return {
    name,
    first: parts[0],
    last: parts.slice(1).join(" "),
  };
}

function inferQuestionType(field: FormField): string {
  if (field.questionType) return field.questionType;
  const t = (field.type || "").toLowerCase();
  const label = (field.label || "").toLowerCase();
  if (t.includes("agree") || label.includes("agree") || label.includes("i accept"))
    return "agree-check";
  if (label.includes("linkedin") || t === "linkedin") return "linkedin";
  if (label.includes("github") || t === "github") return "github";
  if (label.includes("twitter") || label.includes(" x ") || t === "twitter")
    return "twitter";
  if (label.includes("instagram") || t === "instagram") return "instagram";
  if (label.includes("youtube") || t === "youtube") return "youtube";
  if (label.includes("phone") || t.includes("tel")) return "phone-number";
  if (t === "company" || label.includes("company") || label.includes("employer"))
    return "company";
  if (
    label.includes("website") ||
    label.includes("portfolio") ||
    label.includes("url") ||
    t === "url"
  )
    return "url";
  if (
    t.includes("textarea") ||
    t.includes("long") ||
    label.includes("why") ||
    label.length > 60
  )
    return "long-text";
  if (field.options?.length) return "dropdown";
  return "text";
}

function normalizeSocialValue(questionType: string, raw: string): unknown {
  const v = raw.trim();
  if (questionType === "github") {
    const m = v.match(/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9\-]|-(?=[A-Za-z0-9])){0,38})/i);
    if (m) return m[1];
    return v.replace(/^@/, "").replace(/^https?:\/\//i, "").split("/")[0];
  }
  if (questionType === "twitter") {
    const m = v.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})/i);
    if (m) return m[1];
    return v.replace(/^@/, "");
  }
  if (questionType === "instagram") {
    const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
    if (m) return m[1];
    return v.replace(/^@/, "");
  }
  if (questionType === "linkedin") {
    if (/linkedin\.com\/in\//i.test(v)) {
      return v.startsWith("http") ? v.replace(/\/$/, "") : `https://${v}`;
    }
    return `https://www.linkedin.com/in/${v.replace(/^@/, "").replace(/\/$/, "")}`;
  }
  if (questionType === "company") {
    // Luma expects { company, job_title } when collect_job_title is enabled
    return { company: v, job_title: null };
  }
  return v;
}

function toRegistrationAnswers(
  fields: FormField[],
  answers: Record<string, string>
): Array<{
  label: string;
  question_id: string;
  question_type: string;
  value: unknown;
}> {
  const out: Array<{
    label: string;
    question_id: string;
    question_type: string;
    value: unknown;
  }> = [];

  for (const field of fields) {
    const key = field.name || field.id;
    if (["name", "email", "full_name", "first_name", "last_name"].includes(key)) {
      continue;
    }
    const raw = answers[key];
    if (raw == null || !String(raw).trim()) continue;

    const questionType = inferQuestionType(field);
    let value: unknown = normalizeSocialValue(questionType, String(raw));

    if (questionType === "agree-check") {
      const lower = String(raw).toLowerCase();
      value = ["yes", "true", "1", "agree", "on"].includes(lower);
    } else if (questionType === "multi-select") {
      value = String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    out.push({
      label: field.label,
      question_id: field.id,
      question_type: questionType,
      value,
    });
  }
  return out;
}

async function submitToLuma(
  event: LumaEventData,
  answers: Record<string, string>,
  formFields: FormField[]
): Promise<{
  ok: boolean;
  status: number;
  body: string;
  demo: boolean;
  needsVerification?: boolean;
  paidSkipped?: boolean;
}> {
  const demoSubmit = process.env.LUMA_DEMO_SUBMIT === "true";
  const ticket = event.ticketTypes[0];
  const cents =
    ticket?.cents ??
    (typeof ticket?.price === "number" ? Math.round(ticket.price * 100) : 0) ??
    0;

  if (ticket && !ticket.isFree && (cents || 0) > 0) {
    return {
      ok: false,
      status: 402,
      body: JSON.stringify({
        message: "Paid / ticketed event — complete payment on Luma manually.",
      }),
      demo: false,
      paidSkipped: true,
    };
  }

  const fullName = answers.name || answers.full_name || "";
  const { name, first, last } = splitName(fullName);
  const email = answers.email || "";

  const payload = {
    coupon_code: null,
    currency: null,
    email,
    eth_address_info: null,
    event_api_id: event.eventId,
    payment_method: null,
    phone_number: answers.phone || answers.phone_number || null,
    ticket_type_to_selection: ticket
      ? { [ticket.id]: { count: 1, amount: cents || 0 } }
      : {},
    expected_amount_cents: 0,
    expected_amount_tax: 0,
    for_waitlist: false,
    name,
    first_name: first || name,
    last_name: last || "",
    event_invite_api_id: null,
    payment_method_id: null,
    registration_answers: toRegistrationAnswers(formFields, answers),
    opened_from: {
      source: "event",
      event_api_id: event.eventId,
      medium: null,
    },
    solana_address_info: null,
    token_gate_info: null,
    payment_currency: null,
  };

  try {
    const response = await axios.post(
      event.submitEndpoint || "https://api.lu.ma/event/register",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Origin: "https://lu.ma",
          Referer: event.sourceUrl,
        },
        timeout: 25000,
        validateStatus: () => true,
      }
    );

    const body =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    const code =
      typeof response.data === "object" &&
      response.data &&
      "code" in response.data
        ? String((response.data as { code?: string }).code || "")
        : "";

    if (response.status >= 200 && response.status < 300) {
      const statusField =
        typeof response.data === "object" &&
        response.data &&
        "status" in response.data
          ? String((response.data as { status?: string }).status || "")
          : "";
      if (statusField && statusField !== "success") {
        // e.g. require-payment-confirmation
        if (statusField.includes("payment")) {
          return {
            ok: false,
            status: response.status,
            body,
            demo: false,
            paidSkipped: true,
          };
        }
      }
      return { ok: true, status: response.status, body, demo: false };
    }

    if (
      response.status === 403 &&
      code.includes("additional-verification")
    ) {
      return {
        ok: false,
        status: 403,
        body,
        demo: false,
        needsVerification: true,
      };
    }

    if (demoSubmit) {
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
  /** Skip LLM drafting (use on page load + when the client already sent answers). */
  skipLlm?: boolean;
}): Promise<{
  user: ProfileForFill;
  event: LumaEventData;
  answers: Record<string, string>;
  formFields: FormField[];
}> {
  const row = await findUserById(input.userId);
  if (!row) throw new Error("User not found");
  const user = await profileFromStored(input.userId, toProfile(row));

  const event = input.event || (await scrapeOrFallback(input.eventId));
  const stored = await findEventDetailBySlug(event.slug);
  const fromDetails = fieldsFromStoredDetails(stored?.registrationQuestionsJson);
  const formFields = mergeFormFields(event.formFields, fromDetails);

  let answers = buildProfileAnswers(formFields, user, input.answers || {});

  const clientProvided = Boolean(
    input.answers && Object.keys(input.answers).length > 0
  );
  const missingRequired = formFields.filter((f) => {
    if (!f.required) return false;
    return !answers[f.name || f.id]?.trim();
  });

  // Only call the LLM when required fields are still blank and the caller
  // didn't ask us to skip (page load / form submit with answers already set).
  if (!input.skipLlm && !clientProvided && missingRequired.length > 0) {
    const knowledge = await getAgentKnowledgeContext(input.userId);
    try {
      answers = await fillBlanksWithAgent({
        fields: formFields,
        existing: answers,
        user,
        eventTitle: event.title,
        eventDescription:
          stored?.descriptionText || event.description || undefined,
        knowledgeText: knowledge.text,
      });
    } catch (err) {
      console.error("[apply] LLM fill skipped:", err);
    }
  }

  // Final deterministic social pass — never leave GitHub/Twitter blank if LinkedIn has them
  answers = buildProfileAnswers(formFields, user, answers);

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
    const wasDemo =
      existing.responseBody?.includes('"simulated":true') ||
      existing.message?.toLowerCase().includes("demo mode");
    if (!wasDemo) {
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
        lumaUrl: existing.eventUrl,
      };
    }
    // Previous "success" was demo-only — allow a real Luma submit retry
  }

  // Always allow retry after failed / captcha / paid-manual attempts
  // (unique row is upserted below).

  let prepared;
  try {
    prepared = await prepareRegistrationAnswers({
      userId: input.userId,
      eventId: input.eventId,
      answers: input.answers,
      // Form / browser submits already have answers — don't block on LLM.
      skipLlm:
        input.browserAssist === true ||
        Boolean(input.answers && Object.keys(input.answers).length > 0),
    });
  } catch (err) {
    return {
      success: false,
      status: "failed",
      message: err instanceof Error ? err.message : "Could not prepare answers",
      event: { id: input.eventId, title: "", url: "", startAt: null },
    };
  }

  const { event, answers, formFields, user } = prepared;
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
      lumaUrl: event.sourceUrl,
    };
  }

  // Path 2: browser-assisted apply (user solves Cloudflare Turnstile)
  if (input.browserAssist) {
    // Seed fill keys Luma shows as extra inputs (e.g. job title next to company)
    // without changing the server registration payload logic.
    const browserAnswers: Record<string, string> = {
      ...answers,
      headline: answers.headline || user.headline || user.seniority || "",
      job_title:
        answers.job_title ||
        answers.title ||
        user.headline ||
        user.seniority ||
        user.lifeStatus ||
        "",
    };
    const browser = await browserAssistLumaApply({
      eventUrl: event.sourceUrl,
      answers: browserAnswers,
      formFields,
    });

    const status: ApplyResult["status"] =
      browser.ok
        ? browser.status === "pending"
          ? "pending"
          : "success"
        : "failed";

    const application = await upsertApplication({
      userId: input.userId,
      eventId: event.slug,
      eventTitle: event.title,
      eventUrl: event.sourceUrl,
      eventDate: event.startAt,
      status,
      message: browser.message,
      formPayload: JSON.stringify(answers),
      responseBody: (browser.responseBody || "").slice(0, 4000),
    });

    return {
      success: browser.ok,
      status,
      message: browser.message,
      event: {
        id: event.slug,
        title: event.title,
        url: event.sourceUrl,
        startAt: event.startAt,
      },
      applicationId: application.id,
      filledAnswers: answers,
      lumaUrl: event.sourceUrl,
      browserAssistAvailable: true,
    };
  }

  // Path 3: server POST when Luma does not require captcha
  const submission = await submitToLuma(event, answers, formFields);

  let status: ApplyResult["status"];
  let message: string;
  let browserAssistAvailable = false;

  if (submission.paidSkipped) {
    status = "paid_manual";
    message =
      "This event requires payment on Luma. Open the event and complete checkout there — we don’t process payments.";
  } else if (submission.needsVerification) {
    status = "needs_verification";
    browserAssistAvailable = true;
    message =
      "Luma requires a captcha. Use Browser assist — we’ll open Luma, autofill your LinkedIn answers, and you solve the captcha then click Register.";
  } else if (submission.ok) {
    status = event.requiresApproval ? "pending" : "success";
    message = submission.demo
      ? event.requiresApproval
        ? "Registration recorded (demo mode). Host approval may still be required on Luma."
        : "Successfully registered (demo mode — not sent to Luma)."
      : event.requiresApproval
        ? "Application submitted to Luma — awaiting host approval."
        : "Successfully registered on Luma!";
  } else {
    status = "failed";
    browserAssistAvailable = true;
    let detail = "";
    try {
      const parsed = JSON.parse(submission.body) as { message?: string };
      detail = parsed.message ? ` — ${parsed.message}` : "";
    } catch {
      detail = "";
    }
    message = `Luma registration failed (HTTP ${submission.status})${detail}. You can retry with Browser assist.`;
  }

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
    lumaUrl: event.sourceUrl,
    browserAssistAvailable,
  };
}
