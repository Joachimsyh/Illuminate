import { Resend } from "resend";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
};

export type SendEmailResult = {
  success: boolean;
  id?: string;
  error?: string;
};

/** Default From address — works with Resend’s shared testing domain. */
export const DEFAULT_FROM = "Illuminate <onboarding@resend.dev>";

/**
 * Hardcoded inbox for the /api/test-email route.
 * Change this to your own inbox to receive mail in a real mailbox.
 */
export const TEST_EMAIL_TO = "delivered@resend.dev";

/** Dynamic lookup so Next.js does not inline the key at build time (Docker-safe). */
function getResendApiKey(): string | undefined {
  return process.env["RESEND_API_KEY"];
}

function getResend(): Resend | null {
  const apiKey = getResendApiKey();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resend = getResend();
  if (!resend) {
    return { success: false, error: "RESEND_API_KEY is missing" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: input.from || DEFAULT_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}

export async function sendTestEmail(to: string = TEST_EMAIL_TO) {
  return sendEmail({
    to,
    subject: "Resend Test Email",
    html: "<h2>Email working!</h2><p>This is a test from Resend.</p>",
  });
}
