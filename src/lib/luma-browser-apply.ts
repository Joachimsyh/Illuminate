import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { FormField } from "@/lib/luma-scraper";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 48);
}

function pickAnswer(
  answers: Record<string, string>,
  ...needles: string[]
): string {
  for (const [key, value] of Object.entries(answers)) {
    if (!value?.trim()) continue;
    const k = key.toLowerCase().replace(/_/g, " ");
    if (needles.some((n) => k.includes(n))) {
      const v = value.trim();
      if (
        (needles.includes("job title") || needles.includes("title")) &&
        (v.includes("http") || v.includes("@"))
      ) {
        continue;
      }
      return v;
    }
  }
  return "";
}

function formatAnswersClipboard(answers: Record<string, string>): string {
  const lines = Object.entries(answers)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`);
  return lines.join("\n");
}

/** Open the event in the user's real Chrome/Edge (not Playwright-controlled). */
function openInSystemBrowser(url: string) {
  const q = url.replace(/"/g, "");
  if (process.platform === "win32") {
    exec(`cmd /c start "" "chrome" "${q}"`, (err) => {
      if (err) exec(`cmd /c start "" "${q}"`);
    });
  } else if (process.platform === "darwin") {
    exec(`open -a "Google Chrome" "${q}" || open "${q}"`);
  } else {
    exec(`google-chrome "${q}" || chromium "${q}" || xdg-open "${q}"`);
  }
}

async function stealthInit(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
    const w = window as Window & { chrome?: { runtime: object } };
    w.chrome = w.chrome || { runtime: {} };
  });
}

/**
 * Force Luma registration sheets/modals to accept wheel scrolling.
 * Luma often sets overflow:hidden on dialog ancestors and traps scroll.
 */
async function ensureFormScrollable(page: Page) {
  await page.evaluate(() => {
    const styleId = "illuminate-scroll-fix";
    document.getElementById(styleId)?.remove();
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      html, body {
        overflow: auto !important;
        height: auto !important;
        max-height: none !important;
        overscroll-behavior: auto !important;
        touch-action: pan-y !important;
      }
      [role="dialog"],
      [data-radix-dialog-content],
      [data-state="open"],
      [class*="Modal"],
      [class*="Drawer"],
      [class*="Sheet"],
      [class*="overlay"] > div,
      [class*="Overlay"] > div {
        overflow-y: auto !important;
        overflow-x: hidden !important;
        max-height: 92vh !important;
        overscroll-behavior: contain !important;
        pointer-events: auto !important;
        touch-action: pan-y !important;
      }
      #illuminate-assist-banner { pointer-events: none !important; }
    `;
    document.head.appendChild(style);

    const unlock = (el: HTMLElement) => {
      el.style.setProperty("overflow-y", "auto", "important");
      el.style.setProperty("overflow", "auto", "important");
      el.style.setProperty("max-height", "92vh", "important");
      el.style.setProperty("pointer-events", "auto", "important");
      el.style.setProperty("touch-action", "pan-y", "important");
      el.style.setProperty("overscroll-behavior", "contain", "important");
      if (el.getAttribute("role") === "dialog" || el.scrollHeight > 100) {
        el.style.setProperty("height", "auto", "important");
      }
    };

    const markers = Array.from(
      document.querySelectorAll<HTMLElement>(
        "form, input, textarea, [role='dialog'], h2, h3, button"
      )
    ).filter((el) => {
      const t = (el.textContent || "").toLowerCase();
      return (
        el.tagName === "FORM" ||
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        t.includes("your info") ||
        t.includes("register") ||
        t.includes("select an option")
      );
    });

    for (const start of markers.slice(0, 30)) {
      let el: HTMLElement | null = start;
      for (let i = 0; i < 16 && el; i++) {
        const cs = window.getComputedStyle(el);
        const oy = cs.overflowY;
        const locked =
          oy === "hidden" ||
          oy === "clip" ||
          cs.overflow === "hidden" ||
          el.scrollHeight > el.clientHeight + 8;
        if (locked || el.getAttribute("role") === "dialog") unlock(el);
        el = el.parentElement;
      }
    }

    document
      .querySelectorAll<HTMLElement>(
        '[role="dialog"], [data-radix-dialog-content], [class*="Modal"], [class*="Drawer"], [class*="Sheet"]'
      )
      .forEach(unlock);

    // Redirect wheel events to the nearest scrollable ancestor of the form
    const w = window as Window & { __illuminateWheel?: boolean };
    if (!w.__illuminateWheel) {
      w.__illuminateWheel = true;
      document.addEventListener(
        "wheel",
        (ev) => {
          const path = ev.composedPath?.() || [];
          let scrollEl: HTMLElement | null = null;
          for (const node of path) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.id === "illuminate-assist-banner") continue;
            const cs = window.getComputedStyle(node);
            const oy = cs.overflowY;
            if (
              (oy === "auto" || oy === "scroll" || oy === "overlay") &&
              node.scrollHeight > node.clientHeight + 4
            ) {
              scrollEl = node;
              break;
            }
          }
          if (!scrollEl) {
            const dialog = document.querySelector<HTMLElement>(
              '[role="dialog"], [data-radix-dialog-content]'
            );
            if (dialog) {
              unlock(dialog);
              scrollEl = dialog;
            }
          }
          if (!scrollEl) return;
          const before = scrollEl.scrollTop;
          scrollEl.scrollTop += ev.deltaY;
          if (scrollEl.scrollTop !== before) {
            ev.preventDefault();
            ev.stopPropagation();
          }
        },
        { capture: true, passive: false }
      );
    }
  });
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
        "top:8px",
        "right:12px",
        "left:auto",
        "transform:none",
        "z-index:2147483647",
        "max-width:340px",
        "padding:8px 12px",
        "border-radius:10px",
        "background:#111827",
        "color:#f9fafb",
        "font:600 12px/1.35 system-ui,sans-serif",
        "box-shadow:0 8px 28px rgba(0,0,0,.35)",
        "border:1px solid rgba(245,166,35,.55)",
        "pointer-events:none",
        "white-space:pre-wrap",
      ].join(";")
    );
    el.textContent = msg;
    document.body.appendChild(el);
  }, text);
}

async function fillTextNearLabel(
  page: Page,
  labelPart: string,
  value: string
): Promise<boolean> {
  if (!value.trim()) return false;
  try {
    const label = page.getByText(new RegExp(escapeReg(labelPart), "i")).first();
    if (!(await label.isVisible().catch(() => false))) return false;
    const box = label.locator(
      "xpath=ancestor::*[self::label or self::div][1]//input | ancestor::*[self::label or self::div][1]//textarea"
    );
    const input = box.first();
    if (await input.count()) {
      await input.scrollIntoViewIfNeeded().catch(() => undefined);
      await input.click({ timeout: 2000 });
      await input.fill("");
      await input.fill(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    await page.getByLabel(new RegExp(escapeReg(labelPart), "i")).fill(value);
    return true;
  } catch {
    return false;
  }
}

async function clickDropdownOption(
  page: Page,
  optionText: string
): Promise<boolean> {
  const patterns = [
    page.getByRole("option", {
      name: new RegExp(`^${escapeReg(optionText)}$`, "i"),
    }),
    page.locator(
      '[role="option"], [role="menuitem"], [data-radix-collection-item], li[data-highlighted], li'
    ).filter({
      hasText: new RegExp(`^\\s*${escapeReg(optionText)}\\s*$`, "i"),
    }),
    page.getByText(new RegExp(`^\\s*${escapeReg(optionText)}\\s*$`, "i")),
  ];

  for (const loc of patterns) {
    const first = loc.first();
    if (await first.isVisible({ timeout: 900 }).catch(() => false)) {
      await first.click({ timeout: 2000 });
      return true;
    }
  }

  // Keyboard fallback (Radix / listbox often focuses first option)
  await page.keyboard.type(optionText.slice(0, 12), { delay: 40 }).catch(() => undefined);
  await sleep(150);
  await page.keyboard.press("Enter").catch(() => undefined);
  await sleep(200);
  return false;
}

/**
 * Fill Luma-style custom dropdowns ("Select an option" / combobox / Radix select).
 */
async function fillCustomDropdowns(
  page: Page,
  formFields: FormField[],
  answers: Record<string, string>
): Promise<number> {
  let filled = 0;

  const targets: { label: string; option: string }[] = [];
  for (const field of formFields) {
    const label = field.label || "";
    const key = field.name || field.id;
    let value = (answers[key] || "").trim();
    const low = label.toLowerCase();
    const isSelect =
      field.type === "select" ||
      field.questionType === "dropdown" ||
      field.questionType === "select" ||
      Boolean(field.options?.length);
    if (!value && /speak|speaking/.test(low)) value = "No";
    if (!value && field.options?.length) {
      const no = field.options.find((o) => /^no$/i.test(o.trim()));
      if (no && /speak|yes\/no|are you/i.test(low)) value = no;
    }
    if (!value || (!isSelect && !/speak|select|option/i.test(low))) {
      if (!value) continue;
      if (!isSelect && !/speak/i.test(low)) continue;
    }
    const option =
      field.options?.find((o) => o.toLowerCase() === value.toLowerCase()) ||
      field.options?.find((o) =>
        o.toLowerCase().includes(value.toLowerCase())
      ) ||
      value;
    targets.push({ label, option });
  }
  if (!targets.some((t) => /speak/i.test(t.label))) {
    targets.push({
      label: "Are you applying to speak",
      option: "No",
    });
  }

  const triggerSelector = [
    "button:has-text('Select an option')",
    "[role='combobox']",
    "[aria-haspopup='listbox']",
    "button[aria-haspopup='listbox']",
    "[data-radix-select-trigger]",
    "button:has-text('Select')",
  ].join(", ");

  const triggers = page.locator(triggerSelector);
  const triggerCount = await triggers.count().catch(() => 0);

  for (let i = 0; i < triggerCount; i++) {
    const trigger = triggers.nth(i);
    if (!(await trigger.isVisible().catch(() => false))) continue;

    const current = ((await trigger.innerText().catch(() => "")) || "").trim();
    if (current && !/select(\s+an)?\s+option/i.test(current) && current !== "Select") {
      // Already has a selection
      continue;
    }

    const contextLabel = await trigger.evaluate((node) => {
      let el: HTMLElement | null = node as HTMLElement;
      for (let d = 0; d < 10 && el; d++) {
        const labels = el.querySelectorAll("label, p, span, div, h3, h4");
        for (const lab of Array.from(labels)) {
          const t = (lab.textContent || "").trim();
          if (
            t.length > 8 &&
            t.length < 180 &&
            !/select(\s+an)?\s+option|^select$/i.test(t)
          ) {
            return t;
          }
        }
        el = el.parentElement;
      }
      return "";
    });

    const target =
      targets.find((t) =>
        contextLabel.toLowerCase().includes(t.label.slice(0, 28).toLowerCase())
      ) ||
      (/speak/i.test(contextLabel)
        ? { label: contextLabel, option: "No" }
        : null);
    if (!target) continue;

    try {
      await trigger.scrollIntoViewIfNeeded().catch(() => undefined);
      await ensureFormScrollable(page);
      await trigger.click({ timeout: 2500 });
      await sleep(400);

      const clicked = await clickDropdownOption(page, target.option);
      if (clicked) {
        filled += 1;
      } else {
        // Try "No" / first yes-no style option for speak questions
        if (/speak/i.test(contextLabel)) {
          if (await clickDropdownOption(page, "No")) filled += 1;
        }
        await page.keyboard.press("Escape").catch(() => undefined);
      }
      await sleep(200);
    } catch {
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  }

  // Label-driven pass: find "Are you applying to speak" then click nearby select
  for (const target of targets) {
    try {
      const label = page
        .getByText(new RegExp(escapeReg(target.label.slice(0, 36)), "i"))
        .first();
      if (!(await label.isVisible().catch(() => false))) continue;
      await label.scrollIntoViewIfNeeded().catch(() => undefined);
      const nearby = label.locator(
        "xpath=ancestor::*[self::div or self::label or self::section][1]//button | ancestor::*[self::div or self::label or self::section][1]//*[@role='combobox']"
      );
      const btn = nearby.first();
      if (!(await btn.count())) continue;
      const txt = ((await btn.innerText().catch(() => "")) || "").trim();
      if (txt && !/select/i.test(txt) && txt.toLowerCase() === target.option.toLowerCase()) {
        continue;
      }
      await btn.click({ timeout: 2000 });
      await sleep(350);
      if (await clickDropdownOption(page, target.option)) filled += 1;
      else await page.keyboard.press("Escape").catch(() => undefined);
    } catch {
      /* continue */
    }
  }

  return filled;
}

async function autofillPage(
  page: Page,
  formFields: FormField[],
  answers: Record<string, string>
): Promise<number> {
  let filled = 0;

  const name = answers.name || answers.full_name || "";
  const email = answers.email || "";
  const jobTitle =
    pickAnswer(answers, "job title", "title", "role", "headline", "seniority") ||
    answers.job_title ||
    answers.headline ||
    "";
  const company =
    pickAnswer(answers, "company", "organization", "employer") ||
    answers.company ||
    "";
  const linkedin =
    pickAnswer(answers, "linkedin") || answers.linkedin || "";
  const heard =
    pickAnswer(answers, "hear", "how did you") || answers.heard || "luma";

  if (name && (await fillTextNearLabel(page, "Name", name))) filled += 1;
  if (email && (await fillTextNearLabel(page, "Email", email))) filled += 1;
  if (
    company &&
    (await fillTextNearLabel(page, "company do you work", company))
  ) {
    filled += 1;
  }
  if (jobTitle && (await fillTextNearLabel(page, "job title", jobTitle))) {
    filled += 1;
  }
  if (linkedin && (await fillTextNearLabel(page, "LinkedIn", linkedin))) {
    filled += 1;
  }
  if (
    heard &&
    (await fillTextNearLabel(page, "hear about this event", heard))
  ) {
    filled += 1;
  }

  for (const field of formFields) {
    const key = field.name || field.id;
    if (["name", "email", "full_name"].includes(key)) continue;
    const value = (answers[key] || "").trim();
    if (!value) continue;
    if (await fillTextNearLabel(page, field.label.slice(0, 40), value)) {
      filled += 1;
    }
  }

  await page.evaluate(
    ({ answerMap, jobTitle: title, company: co, linkedin: li, heard: hr }) => {
      const setNative = (
        input: HTMLInputElement | HTMLTextAreaElement,
        value: string
      ) => {
        const proto =
          input instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        desc?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const labelFor = (el: HTMLElement) => {
        const id = el.id;
        const byFor = id
          ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent
          : "";
        return (
          byFor ||
          el.closest("label")?.textContent ||
          el.getAttribute("aria-label") ||
          el.previousElementSibling?.textContent ||
          el.parentElement?.textContent ||
          ""
        ).toLowerCase();
      };

      for (const input of Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea"
        )
      )) {
        if (input.value?.trim()) continue;
        const lab = labelFor(input);
        if (lab.includes("job title") && title) setNative(input, title);
        else if (lab.includes("company") && co) setNative(input, co);
        else if (lab.includes("linkedin") && li) setNative(input, li);
        else if (lab.includes("hear") && hr) setNative(input, hr);
        else {
          for (const [k, v] of Object.entries(answerMap)) {
            if (!v?.trim()) continue;
            if (lab.includes(k.toLowerCase().replace(/_/g, " "))) {
              setNative(input, v);
              break;
            }
          }
        }
      }
    },
    {
      answerMap: answers,
      jobTitle,
      company,
      linkedin,
      heard,
    }
  );

  filled += await fillCustomDropdowns(page, formFields, answers);
  return filled;
}

type LaunchHandle = {
  browser: Browser | null;
  context: BrowserContext;
  mode: "chrome-persistent" | "chrome" | "chromium";
};

async function launchAssistBrowser(): Promise<LaunchHandle> {
  const profileDir = path.join(
    os.tmpdir(),
    "illuminate-luma-chrome-profile"
  );
  fs.mkdirSync(profileDir, { recursive: true });

  const commonArgs = [
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--no-default-browser-check",
    "--no-first-run",
  ];

  // Persistent real Chrome profile — best chance Cloudflare accepts a human click.
  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: "chrome",
      headless: false,
      viewport: null,
      locale: "en-GB",
      timezoneId: "Europe/London",
      colorScheme: "light",
      ignoreDefaultArgs: ["--enable-automation"],
      args: commonArgs,
    });
    return { browser: null, context, mode: "chrome-persistent" };
  } catch {
    /* fall through */
  }

  try {
    const browser = await chromium.launch({
      headless: false,
      channel: "chrome",
      ignoreDefaultArgs: ["--enable-automation"],
      args: commonArgs,
    });
    const context = await browser.newContext({
      viewport: null,
      locale: "en-GB",
      timezoneId: "Europe/London",
      colorScheme: "light",
    });
    return { browser, context, mode: "chrome" };
  } catch {
    /* fall through */
  }

  const browser = await chromium.launch({
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"],
    args: commonArgs,
  });
  const context = await browser.newContext({
    viewport: null,
    locale: "en-GB",
    timezoneId: "Europe/London",
    colorScheme: "light",
  });
  return { browser, context, mode: "chromium" };
}

async function cloudflareBlocking(page: Page): Promise<"ok" | "verifying" | "failed"> {
  const failed = await page
    .getByText(/verification failed/i)
    .isVisible()
    .catch(() => false);
  if (failed) return "failed";
  const verifying = await page
    .getByText(/verifying your browser/i)
    .isVisible()
    .catch(() => false);
  if (verifying) return "verifying";
  return "ok";
}

/**
 * Open a headed browser on the real Luma event page,
 * autofill answers, then wait for the user to solve Turnstile and Register.
 */
export async function browserAssistLumaApply(
  input: BrowserApplyInput
): Promise<BrowserApplyResult> {
  const timeoutMs = input.timeoutMs ?? 5 * 60 * 1000;

  let handle: LaunchHandle;
  try {
    handle = await launchAssistBrowser();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missingBrowser =
      /Executable doesn't exist|browserType\.launch/i.test(message) ||
      message.includes("playwright install");
    return {
      ok: false,
      status: "failed",
      message: missingBrowser
        ? "Playwright Chromium is not installed. Run: npm run playwright:install — then try again. For Cloudflare, also install Google Chrome."
        : `Browser assist failed: ${message}`,
    };
  }

  const { browser, context, mode } = handle;
  let openedSystemFallback = false;

  try {
    const page = context.pages()[0] || (await context.newPage());
    await stealthInit(page);

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
        /* ignore */
      }
    });

    await page.goto(input.eventUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await sleep(1800);

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
          await sleep(700);
        }
      } catch {
        /* continue */
      }
    }

    await ensureFormScrollable(page);
    await sleep(400);

    // Wait for Cloudflare — do not bypass; human must pass (or we open real Chrome).
    const cfDeadline = Date.now() + 75_000;
    let failStreak = 0;
    while (Date.now() < cfDeadline) {
      const state = await cloudflareBlocking(page);
      if (state === "ok") break;

      if (state === "failed") {
        failStreak += 1;
        await injectBanner(
          page,
          mode.startsWith("chrome")
            ? "Cloudflare blocked this automated window.\nClick Troubleshoot / retry in the widget.\nIf it keeps failing, we’ll open real Chrome with your answers on the clipboard."
            : "Cloudflare blocked automated Chromium.\nInstall Google Chrome and retry — or wait for real Chrome fallback."
        );
        await sleep(2500);

        // After repeated failures, open the user's real browser (CF works there).
        if (failStreak >= 3 && !openedSystemFallback) {
          openedSystemFallback = true;
          const clip = formatAnswersClipboard(input.answers);
          await page
            .evaluate(async (text) => {
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                /* ignore */
              }
            }, clip)
            .catch(() => undefined);
          openInSystemBrowser(input.eventUrl);
          await injectBanner(
            page,
            "Opened real Chrome for Cloudflare.\nYour answers are on the clipboard — paste into the form there, then Register.\nYou can close this Playwright window."
          );
        }
      } else {
        failStreak = 0;
        await injectBanner(
          page,
          "Waiting for Cloudflare… complete the check if asked."
        );
        await sleep(1500);
      }
      if (page.isClosed()) break;
    }

    await ensureFormScrollable(page);
    // Scroll form container to top then gradually reveal fields
    await page
      .evaluate(() => {
        const dialog = document.querySelector<HTMLElement>(
          '[role="dialog"], [data-radix-dialog-content], form'
        );
        if (dialog) dialog.scrollTop = 0;
        window.scrollTo(0, 0);
      })
      .catch(() => undefined);

    const filled = await autofillPage(page, input.formFields, input.answers);
    await ensureFormScrollable(page);

    // Scroll through the form so below-the-fold dropdowns mount / become clickable
    await page
      .evaluate(async () => {
        const dialog =
          document.querySelector<HTMLElement>(
            '[role="dialog"], [data-radix-dialog-content]'
          ) || document.scrollingElement;
        if (!dialog) return;
        const max = Math.max(0, dialog.scrollHeight - dialog.clientHeight);
        for (let y = 0; y <= max; y += Math.max(120, Math.floor(max / 6) || 120)) {
          dialog.scrollTop = y;
          await new Promise((r) => setTimeout(r, 80));
        }
        dialog.scrollTop = 0;
      })
      .catch(() => undefined);

    await fillCustomDropdowns(page, input.formFields, input.answers);
    await ensureFormScrollable(page);

    await injectBanner(
      page,
      `Filled ${filled} field(s) via ${mode}.\nScroll with mouse wheel on the form.\nFinish dropdowns + Cloudflare, then Register.`
    );

    const deadline = Date.now() + timeoutMs;
    let tick = 0;
    while (Date.now() < deadline) {
      tick += 1;
      if (tick % 3 === 0) {
        await ensureFormScrollable(page).catch(() => undefined);
      }

      // If CF failed again mid-wait, open system browser once
      if (!openedSystemFallback) {
        const state = await cloudflareBlocking(page);
        if (state === "failed") {
          failStreak += 1;
          if (failStreak >= 2) {
            openedSystemFallback = true;
            const clip = formatAnswersClipboard(input.answers);
            await page
              .evaluate(async (text) => {
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  /* ignore */
                }
              }, clip)
              .catch(() => undefined);
            openInSystemBrowser(input.eventUrl);
            await injectBanner(
              page,
              "Cloudflare won’t pass under automation.\nOpened real Chrome — answers copied to clipboard.\nPaste + Register there."
            );
          }
        } else if (state === "ok") {
          failStreak = 0;
        }
      }

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

      const successText = await page
        .getByText(
          /you.?re (in|registered|going)|registration (received|confirmed)|pending approval|request (sent|received)/i
        )
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
          message: openedSystemFallback
            ? "Playwright window closed. Finish registration in the real Chrome window (answers were copied)."
            : "Browser closed before registration completed.",
          responseBody: registerBody,
        };
      }
      await sleep(1000);
    }

    return {
      ok: false,
      status: "timeout",
      message: openedSystemFallback
        ? "Timed out in assist window. Finish in the real Chrome tab (answers were on the clipboard)."
        : "Timed out waiting for captcha + submit. Re-run browser assist when ready.",
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
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
