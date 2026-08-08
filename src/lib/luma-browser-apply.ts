import { chromium, type Page } from "playwright";
import type { FormField } from "@/lib/luma-scraper";

export type BrowserApplyInput = {
  eventUrl: string;
  answers: Record<string, string>;
  formFields: FormField[];
  /** How long to wait for the user to solve captcha + submit (ms) */
  timeoutMs?: number;
};

export type BrowserApplyResult = {
  ok: boolean;
  status: "success" | "pending" | "timeout" | "failed" | "cancelled";
  message: string;
  responseBody?: string;
};

function labelHints(field: FormField): string[] {
  const label = (field.label || "").toLowerCase();
  const key = (field.name || field.id || "").toLowerCase();
  const type = (field.questionType || field.type || "").toLowerCase();
  return [label, key, type].filter(Boolean);
}

async function fillByLabels(
  page: Page,
  hints: string[],
  value: string
): Promise<boolean> {
  if (!value.trim()) return false;

  // Try labeled inputs / textareas
  for (const hint of hints) {
    const locators = [
      page.getByLabel(new RegExp(escapeReg(hint), "i")),
      page.getByPlaceholder(new RegExp(escapeReg(hint), "i")),
      page.locator(
        `input[name*="${cssSafe(hint)}"], textarea[name*="${cssSafe(hint)}"]`
      ),
      page.locator(
        `input[id*="${cssSafe(hint)}"], textarea[id*="${cssSafe(hint)}"]`
      ),
    ];
    for (const loc of locators) {
      try {
        const el = loc.first();
        if ((await el.count()) === 0) continue;
        if (!(await el.isVisible().catch(() => false))) continue;
        await el.click({ timeout: 2000 });
        await el.fill("");
        await el.fill(value);
        return true;
      } catch {
        /* try next */
      }
    }
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40);
}

function cssSafe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

async function injectBanner(page: Page, text: string) {
  await page.evaluate((msg) => {
    const id = "illuminate-assist-banner";
    document.getElementById(id)?.remove();
    const el = document.createElement("div");
    el.id = id;
    el.setAttribute(
      "style",
      [
        "position:fixed",
        "top:12px",
        "left:50%",
        "transform:translateX(-50%)",
        "z-index:2147483647",
        "max-width:min(640px,92vw)",
        "padding:12px 16px",
        "border-radius:12px",
        "background:#111827",
        "color:#f9fafb",
        "font:600 14px/1.4 system-ui,sans-serif",
        "box-shadow:0 10px 40px rgba(0,0,0,.35)",
        "border:1px solid rgba(245,166,35,.55)",
      ].join(";")
    );
    el.textContent = msg;
    document.body.appendChild(el);
  }, text);
}

async function autofillPage(
  page: Page,
  formFields: FormField[],
  answers: Record<string, string>
): Promise<number> {
  let filled = 0;

  // Core identity first
  const name = answers.name || answers.full_name || "";
  const email = answers.email || "";
  if (name) {
    const ok = await fillByLabels(
      page,
      ["full name", "name", "your name"],
      name
    );
    if (ok) filled += 1;
  }
  if (email) {
    const ok = await fillByLabels(page, ["email", "e-mail"], email);
    if (ok) filled += 1;
  }

  for (const field of formFields) {
    const key = field.name || field.id;
    if (["name", "email", "full_name"].includes(key)) continue;
    const value = answers[key];
    if (!value?.trim()) continue;

    const hints = labelHints(field);
    // Prefer distinctive words from the label
    const words = (field.label || "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 4);
    const ok = await fillByLabels(page, [...hints, ...words], value);
    if (ok) filled += 1;
  }

  // Generic pass: match remaining visible empty inputs by nearby text
  await page.evaluate((answerMap) => {
    const entries = Object.entries(answerMap).filter(([, v]) => v?.trim());
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea"
      )
    );
    for (const input of inputs) {
      if (input.value?.trim()) continue;
      const labelText = (
        input.labels?.[0]?.textContent ||
        input.getAttribute("aria-label") ||
        input.placeholder ||
        input.name ||
        ""
      ).toLowerCase();
      for (const [key, value] of entries) {
        const k = key.toLowerCase().replace(/_/g, " ");
        if (
          labelText.includes(k) ||
          (k.includes("github") && labelText.includes("github")) ||
          (k.includes("linkedin") && labelText.includes("linkedin")) ||
          (k.includes("twitter") &&
            (labelText.includes("twitter") || labelText.includes("x"))) ||
          (k.includes("why") && labelText.includes("why"))
        ) {
          // Luma uses React-controlled inputs — set via native setter.
          const proto =
            input instanceof HTMLTextAreaElement
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, "value");
          desc?.set?.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          break;
        }
      }
    }
  }, answers);

  return filled;
}

/**
 * Open a headed Chromium window on the real Luma event page,
 * autofill LinkedIn-derived answers, then wait for the user to
 * solve Cloudflare Turnstile and click Register.
 */
export async function browserAssistLumaApply(
  input: BrowserApplyInput
): Promise<BrowserApplyResult> {
  const timeoutMs = input.timeoutMs ?? 5 * 60 * 1000;
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    let registerBody = "";
    let registerOk = false;
    let registerPending = false;

    page.on("response", async (res) => {
      try {
        const url = res.url();
        if (!url.includes("/event/register")) return;
        const status = res.status();
        const text = await res.text().catch(() => "");
        registerBody = text.slice(0, 4000);
        if (status >= 200 && status < 300) {
          try {
            const json = JSON.parse(text) as { status?: string };
            if (!json.status || json.status === "success") {
              registerOk = true;
            } else if (String(json.status).includes("pending")) {
              registerPending = true;
              registerOk = true;
            } else {
              registerOk = true;
            }
          } catch {
            registerOk = true;
          }
        }
      } catch {
        /* ignore listener errors */
      }
    });

    await page.goto(input.eventUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await sleep(1500);

    // Try to open registration UI if gated behind a button
    for (const label of [
      /request to join/i,
      /register/i,
      /rsvp/i,
      /get ticket/i,
      /approve/i,
      /apply/i,
    ]) {
      try {
        const btn = page.getByRole("button", { name: label }).first();
        if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
          await btn.click({ timeout: 2000 }).catch(() => undefined);
          await sleep(600);
        }
      } catch {
        /* continue */
      }
    }

    const filled = await autofillPage(page, input.formFields, input.answers);
    await injectBanner(
      page,
      `Illuminate filled ${filled} field(s). Solve the Cloudflare captcha, then click Register / Request to Join.`
    );

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (registerOk) {
        await injectBanner(
          page,
          "Registration sent to Luma. You can close this window."
        );
        await sleep(1500);
        return {
          ok: true,
          status: registerPending ? "pending" : "success",
          message: registerPending
            ? "Submitted via browser — awaiting host approval on Luma."
            : "Successfully registered on Luma via browser assist.",
          responseBody: registerBody,
        };
      }
      // Success UI heuristics
      const successText = await page
        .getByText(/you.?re (in|registered|going)|registration (received|confirmed)|pending approval|request (sent|received)/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (successText) {
        return {
          ok: true,
          status: "success",
          message: "Luma shows a registration confirmation in the browser.",
          responseBody: registerBody || '{"browser":"ui-success"}',
        };
      }
      if (page.isClosed()) {
        return {
          ok: false,
          status: "cancelled",
          message: "Browser closed before registration completed.",
          responseBody: registerBody,
        };
      }
      await sleep(1000);
    }

    return {
      ok: false,
      status: "timeout",
      message:
        "Timed out waiting for captcha + submit. Re-run browser assist when ready.",
      responseBody: registerBody,
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      message:
        err instanceof Error
          ? `Browser assist failed: ${err.message}`
          : "Browser assist failed",
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
