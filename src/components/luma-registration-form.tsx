"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  Monitor,
  Sparkles,
  XCircle,
} from "lucide-react";
import { MagneticButton } from "@/components/motion";
import type { FormField } from "@/lib/luma-scraper";

type ApplyResponse = {
  success: boolean;
  status: string;
  message: string;
  demo?: boolean;
  error?: string;
  filledAnswers?: Record<string, string>;
  lumaUrl?: string;
  browserAssistAvailable?: boolean;
};

function fieldKey(field: FormField): string {
  return field.name || field.id;
}

function isLongText(field: FormField): boolean {
  const t = (field.type || "").toLowerCase();
  return (
    t.includes("textarea") ||
    t.includes("long") ||
    t.includes("multi") ||
    (field.label?.length || 0) > 60
  );
}

/**
 * The real Luma registration questions as an editable form,
 * prefilled from LinkedIn / profile / agent drafts.
 */
export function LumaRegistrationForm({
  eventId,
  fields,
  initialAnswers,
  disabled,
}: {
  eventId: string;
  fields: FormField[];
  initialAnswers: Record<string, string>;
  disabled?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const key = fieldKey(field);
      next[key] = initialAnswers[key] || field.value || "";
    }
    return next;
  });
  const [loading, setLoading] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [result, setResult] = useState<ApplyResponse | null>(null);

  const missingRequired = useMemo(() => {
    return fields.filter((f) => {
      if (!f.required) return false;
      return !answers[fieldKey(f)]?.trim();
    });
  }, [answers, fields]);

  function update(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }

  async function submit(opts?: { browserAssist?: boolean; autoFallback?: boolean }) {
    if (disabled || missingRequired.length) return;

    const usingBrowser = opts?.browserAssist === true;
    if (usingBrowser) setBrowserLoading(true);
    else setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          answers,
          browserAssist: usingBrowser,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApplyResponse & {
        error?: string;
      };
      const normalized: ApplyResponse = {
        success: Boolean(data.success),
        status: data.status || (res.ok ? "success" : "failed"),
        message:
          data.message ||
          data.error ||
          (res.ok ? "Submitted" : `Submit failed (HTTP ${res.status})`),
        demo: data.demo,
        error: data.error,
        filledAnswers: data.filledAnswers,
        lumaUrl: data.lumaUrl,
        browserAssistAvailable: data.browserAssistAvailable,
      };
      setResult(normalized);
      if (normalized.filledAnswers) {
        setAnswers((prev) => ({ ...prev, ...normalized.filledAnswers }));
      }

      // Luma almost always requires captcha — open browser assist automatically.
      const needsBrowser =
        !usingBrowser &&
        opts?.autoFallback !== false &&
        (normalized.status === "needs_verification" ||
          (normalized.browserAssistAvailable && !normalized.success));
      if (needsBrowser) {
        setLoading(false);
        await submit({ browserAssist: true, autoFallback: false });
      }
    } catch {
      setResult({
        success: false,
        status: "failed",
        message: "Network error — try again",
      });
    } finally {
      setLoading(false);
      setBrowserLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit();
  }

  const success = result?.success === true;
  const busy = loading || browserLoading;
  const showBrowser =
    result?.browserAssistAvailable ||
    result?.status === "needs_verification" ||
    result?.status === "failed";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-mist-100">
          Luma registration form
        </h2>
        <p className="mt-1 text-sm text-mist-400">
          Prefills come from your LinkedIn profile. Submit tries Luma directly,
          then opens Browser assist automatically when a captcha is required.
        </p>
      </div>

      <div className="space-y-3">
        {fields.map((field) => {
          const key = fieldKey(field);
          const value = answers[key] ?? "";
          const long = isLongText(field);

          return (
            <label
              key={field.id}
              className="block rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm text-mist-100">
                  {field.label}
                  {field.required ? (
                    <span className="text-lumen-300"> *</span>
                  ) : null}
                </span>
                {field.required && (
                  <Lock className="h-3.5 w-3.5 text-lumen-300/70" />
                )}
              </div>

              {field.options?.length ? (
                <select
                  value={value}
                  onChange={(e) => update(key, e.target.value)}
                  required={field.required}
                  disabled={success}
                  className="w-full rounded-lg border border-white/10 bg-ink-900/80 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                >
                  <option value="">Select…</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : long ? (
                <textarea
                  value={value}
                  onChange={(e) => update(key, e.target.value)}
                  required={field.required}
                  disabled={success}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-white/10 bg-ink-900/80 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                />
              ) : (
                <input
                  type={
                    (field.type || "").toLowerCase().includes("email")
                      ? "email"
                      : "text"
                  }
                  value={value}
                  onChange={(e) => update(key, e.target.value)}
                  required={field.required}
                  disabled={success}
                  className="w-full rounded-lg border border-white/10 bg-ink-900/80 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                />
              )}
            </label>
          );
        })}
      </div>

      {missingRequired.length > 0 && (
        <p className="text-xs text-amber-200/90">
          Fill required fields:{" "}
          {missingRequired.map((f) => f.label).join(", ")}
        </p>
      )}

      <MagneticButton
        type="submit"
        disabled={disabled || busy || success || missingRequired.length > 0}
        className="group relative w-full overflow-hidden rounded-2xl bg-lumen-400 px-6 py-4 text-base font-semibold text-ink-950 shadow-[0_0_40px_rgba(245,166,35,0.25)] transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition duration-700 group-hover:translate-x-full" />
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Trying Luma server submit…
            </>
          ) : success ? (
            <>
              <CheckCircle2 className="h-5 w-5" />
              Applied
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Submit to Luma
            </>
          )}
        </span>
      </MagneticButton>

      {(showBrowser || !result) && !success && (
        <button
          type="button"
          disabled={disabled || busy || missingRequired.length > 0}
          onClick={() => submit({ browserAssist: true })}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-mist-100 transition hover:bg-white/10 disabled:opacity-50"
        >
          {browserLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Browser open — solve captcha, then Register…
            </>
          ) : (
            <>
              <Monitor className="h-4 w-4 text-lumen-300" />
              Browser assist (autofill + you solve captcha)
            </>
          )}
        </button>
      )}

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4 }}
            className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ring-1 ${
              result.success
                ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20"
                : result.status === "needs_verification"
                  ? "bg-amber-500/10 text-amber-100 ring-amber-400/25"
                  : "bg-rose-500/10 text-rose-200 ring-rose-400/20"
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              <p>{result.message || result.error}</p>
              {result.status === "needs_verification" && (
                <p className="mt-2 text-xs opacity-90">
                  Click <strong>Browser assist</strong> above — a Chromium window
                  opens with your LinkedIn answers filled. Solve Cloudflare, then
                  click Register on Luma.
                </p>
              )}
              {result.lumaUrl && !result.success && (
                <a
                  href={result.lumaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-lumen-300 underline"
                >
                  Open event on Luma <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {result.demo && (
                <p className="mt-1 text-xs opacity-70">
                  Demo submit — saved locally only.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
